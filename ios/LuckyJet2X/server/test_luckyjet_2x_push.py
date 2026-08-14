import asyncio
import tempfile
import unittest
from pathlib import Path

import luckyjet_2x_push as app


class FakeNotifier:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def send(self, title: str, body: str, *, kind: str, sound: str = "default") -> None:
        self.messages.append({"title": title, "body": body, "kind": kind})


class MonitorTests(unittest.IsolatedAsyncioTestCase):
    def test_coefficient_formats(self) -> None:
        self.assertEqual(app.coefficient({"topCoefficient": 2.31}), 2.31)
        self.assertEqual(app.coefficient({"finalValues": [1.15, 3.22]}), 3.22)
        self.assertEqual(app.coefficient({"finalValues": {"coefficient": 4.44}}), 4.44)
        self.assertIsNone(app.coefficient({"topCoefficient": None}))

    async def test_five_fresh_rounds_signal_and_first_round_win(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = app.Store(Path(directory) / "test.sqlite3")
            notifier = FakeNotifier()
            monitor = app.Monitor(store, notifier)  # type: ignore[arg-type]
            monitor.state.seeded = True

            coefs = [1.60, 1.70, 1.80, 1.10, 1.20]
            for index, coef in enumerate(coefs, 1):
                await monitor.process_round(f"round-{index}", coef)

            self.assertTrue(monitor.state.pending)
            self.assertEqual([message["kind"] for message in notifier.messages], ["prepare", "signal"])

            await monitor.process_round("result-round", 2.20)
            self.assertFalse(monitor.state.pending)
            self.assertEqual(monitor.state.fresh_count, 0)
            self.assertEqual(monitor.state.wins, 1)
            self.assertEqual(notifier.messages[-1]["kind"], "result_win")
            saved = store.db.execute("SELECT status, coefficient FROM signal_outcomes").fetchone()
            self.assertEqual(saved, ("WIN", 2.2))

            await monitor.close()
            store.db.close()

    async def test_low_window_does_not_signal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = app.Store(Path(directory) / "test.sqlite3")
            notifier = FakeNotifier()
            monitor = app.Monitor(store, notifier)  # type: ignore[arg-type]
            monitor.state.seeded = True

            for index, coef in enumerate([1.10, 1.20, 1.30, 1.40, 1.50], 1):
                await monitor.process_round(f"low-{index}", coef)

            self.assertFalse(monitor.state.pending)
            self.assertEqual([message["kind"] for message in notifier.messages], ["prepare"])

            await monitor.close()
            store.db.close()


if __name__ == "__main__":
    unittest.main()

