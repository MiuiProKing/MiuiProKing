#!/usr/bin/env python3
"""LuckyJet 2X monitor that confirms completed rounds and sends APNs alerts.

The server, not the iPhone process, polls /history.  A round is processed once by
its unique id.  Existing history is only used as a seed on first launch, so the
service never sends a signal for an already completed round.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("luckyjet-2x-push")

HISTORY_URL = os.getenv("LUCKYJET_HISTORY_URL", "https://crash-gateway-grm-cr.100hp.app/history")
CUSTOMER_ID = os.getenv("LUCKYJET_CUSTOMER_ID", "")
SESSION_ID = os.getenv("LUCKYJET_SESSION_ID", "")
POLL_SECONDS = max(0.5, float(os.getenv("POLL_SECONDS", "1.0")))
TARGET = 2.0
FRESH_REQUIRED = 5
LAST_COEF_MIN = 1.5
LAST_COEF_REQUIRED = 3
DB_PATH = Path(os.getenv("DB_PATH", "luckyjet_2x_push.sqlite3"))
REGISTRATION_SECRET = os.getenv("REGISTRATION_SECRET", "")
KYIV = ZoneInfo("Europe/Kyiv")


def _headers() -> dict[str, str]:
    result = {"accept": "application/json"}
    if CUSTOMER_ID:
        result["customer-id"] = CUSTOMER_ID
    if SESSION_ID:
        result["session-id"] = SESSION_ID
    return result


def coefficient(item: dict[str, Any]) -> float | None:
    for key in ("coef", "coefficient", "crash", "value", "topCoefficient", "multiplier"):
        raw = item.get(key)
        try:
            value = float(raw)
            if value > 0:
                return round(1.01 if value == 1 else value, 2)
        except (TypeError, ValueError):
            pass

    final_values = item.get("finalValues")
    candidates: list[Any]
    if isinstance(final_values, list):
        candidates = list(reversed(final_values))
    elif isinstance(final_values, dict):
        candidates = list(final_values.values())
    else:
        candidates = [final_values]
    for raw in candidates:
        if isinstance(raw, dict):
            nested = coefficient(raw)
            if nested is not None:
                return nested
        try:
            value = float(raw)
            if value > 0:
                return round(1.01 if value == 1 else value, 2)
        except (TypeError, ValueError):
            continue
    return None


def round_id(item: dict[str, Any]) -> str:
    value = item.get("id") or item.get("roundId") or item.get("gameId")
    return str(value or "").strip()


class Store:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS rounds (
                id TEXT PRIMARY KEY,
                coefficient REAL NOT NULL,
                processed_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS device_tokens (
                token TEXT PRIMARY KEY,
                bundle_id TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS signal_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signalled_at INTEGER NOT NULL,
                result_round_id TEXT,
                coefficient REAL,
                status TEXT NOT NULL,
                analysis_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        self.db.commit()

    def has_round(self, rid: str) -> bool:
        return self.db.execute("SELECT 1 FROM rounds WHERE id=?", (rid,)).fetchone() is not None

    def add_round(self, rid: str, coef: float) -> None:
        self.db.execute(
            "INSERT OR IGNORE INTO rounds(id, coefficient, processed_at) VALUES(?,?,?)",
            (rid, coef, int(time.time())),
        )
        self.db.commit()

    def put_token(self, token: str, bundle_id: str) -> None:
        self.db.execute(
            "INSERT INTO device_tokens(token,bundle_id,updated_at) VALUES(?,?,?) "
            "ON CONFLICT(token) DO UPDATE SET bundle_id=excluded.bundle_id,updated_at=excluded.updated_at",
            (token, bundle_id, int(time.time())),
        )
        self.db.commit()

    def delete_token(self, token: str) -> None:
        self.db.execute("DELETE FROM device_tokens WHERE token=?", (token,))
        self.db.commit()

    def tokens(self) -> list[str]:
        saved = [row[0] for row in self.db.execute("SELECT token FROM device_tokens").fetchall()]
        manual = [part.strip().lower() for part in os.getenv("APNS_DEVICE_TOKENS", "").split(",")]
        return list(dict.fromkeys(token for token in saved + manual if re.fullmatch(r"[0-9a-f]{64}", token)))

    def load_state(self) -> dict[str, Any] | None:
        row = self.db.execute("SELECT value FROM state WHERE key='monitor'").fetchone()
        if not row:
            return None
        try:
            return json.loads(row[0])
        except json.JSONDecodeError:
            return None

    def save_state(self, state: dict[str, Any]) -> None:
        payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        self.db.execute(
            "INSERT INTO state(key,value) VALUES('monitor',?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (payload,),
        )
        self.db.commit()

    def save_outcome(self, signalled_at: int, rid: str, coef: float, status: str, analysis: dict[str, Any]) -> None:
        self.db.execute(
            "INSERT INTO signal_outcomes(signalled_at,result_round_id,coefficient,status,analysis_json) "
            "VALUES(?,?,?,?,?)",
            (signalled_at, rid, coef, status, json.dumps(analysis, ensure_ascii=False)),
        )
        self.db.commit()


class APNs:
    def __init__(self, store: Store) -> None:
        self.store = store
        self.team_id = os.getenv("APNS_TEAM_ID", "")
        self.key_id = os.getenv("APNS_KEY_ID", "")
        self.bundle_id = os.getenv("APNS_BUNDLE_ID", "com.miuiproking.luckyjet2x")
        self.p8_path = os.getenv("APNS_P8_PATH", "")
        self.sandbox = os.getenv("APNS_USE_SANDBOX", "false").lower() in {"1", "true", "yes"}
        self._jwt: str | None = None
        self._jwt_at = 0

    @property
    def configured(self) -> bool:
        return bool(self.team_id and self.key_id and self.p8_path and Path(self.p8_path).is_file())

    def _authorization(self) -> str:
        now = int(time.time())
        if self._jwt and now - self._jwt_at < 3000:
            return self._jwt
        private_key = Path(self.p8_path).read_text(encoding="utf-8")
        self._jwt = jwt.encode(
            {"iss": self.team_id, "iat": now},
            private_key,
            algorithm="ES256",
            headers={"kid": self.key_id},
        )
        self._jwt_at = now
        return self._jwt

    async def send(self, title: str, body: str, *, kind: str, sound: str = "default") -> None:
        tokens = self.store.tokens()
        if not tokens:
            log.warning("APNs: no device tokens; open the signed app and copy the token from the bell button")
            return
        if not self.configured:
            log.warning("APNs is not configured; set TEAM_ID, KEY_ID and P8_PATH")
            return

        host = "https://api.sandbox.push.apple.com" if self.sandbox else "https://api.push.apple.com"
        payload = {
            "aps": {
                "alert": {"title": title, "body": body},
                "sound": sound,
                "badge": 1,
                "mutable-content": 1,
            },
            "kind": kind,
            "target": TARGET,
            "url": "https://miuiproking.github.io/MiuiProKing/fixed-2x.html",
        }
        headers = {
            "authorization": f"bearer {self._authorization()}",
            "apns-topic": self.bundle_id,
            "apns-push-type": "alert",
            "apns-priority": "10",
        }
        async with httpx.AsyncClient(http2=True, timeout=15) as client:
            for token in tokens:
                try:
                    response = await client.post(f"{host}/3/device/{token}", headers=headers, json=payload)
                    if response.status_code == 200:
                        log.info("APNs %s sent to …%s", kind, token[-8:])
                    else:
                        log.error("APNs %s for …%s: %s %s", kind, token[-8:], response.status_code, response.text)
                        if response.status_code == 410:
                            self.store.delete_token(token)
                except Exception:
                    log.exception("APNs request failed for …%s", token[-8:])


class Telegram:
    def __init__(self) -> None:
        self.token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        self.chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        self.thread_id = os.getenv("TELEGRAM_THREAD_ID", "").strip()

    @property
    def configured(self) -> bool:
        return bool(self.token and self.chat_id)

    async def send(self, title: str, body: str, *, kind: str, sound: str = "default") -> None:
        if not self.configured:
            log.warning("Telegram is not configured; set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID")
            return
        now = datetime.now(KYIV).strftime("%H:%M:%S")
        payload: dict[str, Any] = {
            "chat_id": self.chat_id,
            "text": f"{title}\n\n{body}\n\n🕒 Киев: {now}",
            "disable_web_page_preview": True,
            "reply_markup": {
                "inline_keyboard": [[{
                    "text": "🚀 Открыть LuckyJet 2X",
                    "url": "https://miuiproking.github.io/MiuiProKing/fixed-2x.html",
                }]]
            },
        }
        if self.thread_id:
            try:
                payload["message_thread_id"] = int(self.thread_id)
            except ValueError:
                log.error("TELEGRAM_THREAD_ID must be an integer")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(
                    f"https://api.telegram.org/bot{self.token}/sendMessage",
                    json=payload,
                )
            if response.status_code == 200:
                log.info("Telegram %s sent to chat %s", kind, self.chat_id)
            else:
                log.error("Telegram %s: %s %s", kind, response.status_code, response.text)
        except Exception:
            log.exception("Telegram request failed")


class NotificationFanout:
    def __init__(self, apns: APNs, telegram: Telegram) -> None:
        self.apns = apns
        self.telegram = telegram

    async def send(self, title: str, body: str, *, kind: str, sound: str = "default") -> None:
        await asyncio.gather(
            self.apns.send(title, body, kind=kind, sound=sound),
            self.telegram.send(title, body, kind=kind, sound=sound),
        )


@dataclass
class MonitorState:
    market: list[float] = field(default_factory=list)
    fresh_count: int = 0
    pending: bool = False
    signalled_at: int = 0
    signal_window: list[float] = field(default_factory=list)
    wins: int = 0
    losses: int = 0
    seeded: bool = False

    @classmethod
    def from_dict(cls, value: dict[str, Any] | None) -> "MonitorState":
        if not value:
            return cls()
        allowed = {key for key in cls.__dataclass_fields__}
        return cls(**{key: value[key] for key in allowed if key in value})

    def as_dict(self) -> dict[str, Any]:
        return {
            "market": self.market[-12:],
            "fresh_count": self.fresh_count,
            "pending": self.pending,
            "signalled_at": self.signalled_at,
            "signal_window": self.signal_window[-5:],
            "wins": self.wins,
            "losses": self.losses,
            "seeded": self.seeded,
        }


class Monitor:
    def __init__(self, store: Store, notifier: NotificationFanout) -> None:
        self.store = store
        self.notifier = notifier
        self.state = MonitorState.from_dict(store.load_state())
        self.client = httpx.AsyncClient(timeout=15, follow_redirects=True)

    async def close(self) -> None:
        await self.client.aclose()

    async def fetch_history(self) -> list[dict[str, Any]]:
        response = await self.client.get(HISTORY_URL, headers=_headers())
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list):
            raise ValueError("/history returned a non-list payload")
        return [item for item in data if isinstance(item, dict)]

    async def seed(self, history: list[dict[str, Any]]) -> None:
        valid: list[tuple[str, float]] = []
        for item in history:
            rid, coef = round_id(item), coefficient(item)
            if rid and coef is not None:
                valid.append((rid, coef))
        for rid, coef in reversed(valid):
            self.store.add_round(rid, coef)
        self.state.market = [coef for _, coef in reversed(valid[:12])]
        self.state.fresh_count = 0
        self.state.pending = False
        self.state.seeded = True
        self.store.save_state(self.state.as_dict())
        log.info("Seeded %d completed rounds; waiting for the next unique id", len(valid))

    async def process_round(self, rid: str, coef: float) -> None:
        self.store.add_round(rid, coef)
        self.state.market.append(coef)
        self.state.market = self.state.market[-12:]
        log.info("New completed round %s: %.2fx", rid, coef)

        if self.state.pending:
            status = "WIN" if coef >= TARGET else "LOSS"
            if status == "WIN":
                self.state.wins += 1
                await self.notifier.send(
                    "✅ WIN 2X",
                    f"Первый проверочный раунд завершён: {coef:.2f}X",
                    kind="result_win",
                )
            else:
                self.state.losses += 1
                await self.notifier.send(
                    "❌ LOSS 2X",
                    f"Первый проверочный раунд завершён: {coef:.2f}X. Начат новый полный анализ.",
                    kind="result_loss",
                )
            self.store.save_outcome(
                self.state.signalled_at,
                rid,
                coef,
                status,
                {"window": self.state.signal_window, "target": TARGET, "verification_rounds": 1},
            )
            self.state.pending = False
            self.state.signalled_at = 0
            self.state.signal_window = []
            self.state.fresh_count = 0
            self.store.save_state(self.state.as_dict())
            return

        self.state.fresh_count = min(FRESH_REQUIRED, self.state.fresh_count + 1)
        if self.state.fresh_count == FRESH_REQUIRED - 1:
            await self.notifier.send(
                "⏳ ПРИГОТОВЬТЕСЬ",
                "Собрано 4/5 новых раундов. После следующего результата возможен вход 2.00X.",
                kind="prepare",
            )

        last5 = self.state.market[-5:]
        qualifying = sum(value > LAST_COEF_MIN for value in last5)
        can_signal = self.state.fresh_count >= FRESH_REQUIRED and len(last5) == 5 and qualifying >= LAST_COEF_REQUIRED
        if can_signal:
            self.state.pending = True
            self.state.signalled_at = int(time.time())
            self.state.signal_window = last5.copy()
            await self.notifier.send(
                "🔥 СТАВЬТЕ СЕЙЧАС • 2.00X",
                "Условия подтверждены. Вход только в следующий новый раунд.",
                kind="signal",
            )
            log.info("SIGNAL 2X for next round; window=%s (%d/5 > %.2f)", last5, qualifying, LAST_COEF_MIN)
        elif self.state.fresh_count >= FRESH_REQUIRED:
            log.info("No entry: window=%s (%d/5 > %.2f)", last5, qualifying, LAST_COEF_MIN)
        self.store.save_state(self.state.as_dict())

    async def poll_once(self) -> None:
        history = await self.fetch_history()
        if not self.state.seeded:
            await self.seed(history)
            return
        unseen: list[tuple[str, float]] = []
        for item in history:
            rid, coef = round_id(item), coefficient(item)
            if rid and coef is not None and not self.store.has_round(rid):
                unseen.append((rid, coef))
        for rid, coef in reversed(unseen):
            await self.process_round(rid, coef)

    async def run(self) -> None:
        delay = POLL_SECONDS
        while True:
            try:
                await self.poll_once()
                delay = POLL_SECONDS
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("History poll failed")
                delay = min(max(delay * 2, 2), 30)
            await asyncio.sleep(delay)


store = Store(DB_PATH)
apns = APNs(store)
telegram = Telegram()
notifier = NotificationFanout(apns, telegram)
monitor = Monitor(store, notifier)
monitor_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global monitor_task
    monitor_task = asyncio.create_task(monitor.run(), name="luckyjet-history-monitor")
    yield
    monitor_task.cancel()
    await asyncio.gather(monitor_task, return_exceptions=True)
    await monitor.close()


app = FastAPI(title="LuckyJet 2X Push", version="1.0", lifespan=lifespan)


class Registration(BaseModel):
    token: str
    bundleId: str = "com.miuiproking.luckyjet2x"
    platform: str = "ios"
    appVersion: str = "1.0"


@app.post("/register")
async def register(payload: Registration, x_registration_secret: str | None = Header(default=None)) -> dict[str, bool]:
    if REGISTRATION_SECRET and x_registration_secret != REGISTRATION_SECRET:
        raise HTTPException(status_code=401, detail="invalid registration secret")
    token = payload.token.strip().lower()
    if payload.platform.lower() != "ios" or not re.fullmatch(r"[0-9a-f]{64}", token):
        raise HTTPException(status_code=422, detail="invalid APNs token")
    store.put_token(token, payload.bundleId)
    return {"ok": True}


@app.get("/health")
async def health() -> dict[str, Any]:
    state = monitor.state
    return {
        "ok": True,
        "source": HISTORY_URL,
        "seeded": state.seeded,
        "pending_first_round": state.pending,
        "fresh_rounds": state.fresh_count,
        "last_coefficients": state.market[-5:],
        "registered_devices": len(store.tokens()),
        "apns_configured": apns.configured,
        "telegram_configured": telegram.configured,
        "wins": state.wins,
        "losses": state.losses,
    }
