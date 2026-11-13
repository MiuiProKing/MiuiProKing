// ==UserScript==
// @name         Lucky Jet — посмотреть session-id на iPhone
// @namespace    god-preditor-local-tools
// @version      1.1.0
// @description  Ищет session-id открытой Lucky Jet в URL, iframe и вложенных ссылках (локально, без отправки данных).
// @match        https://one-vv1935.com/*
// @match        https://1play.gamedev-tech.cc/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';
  const PANEL_ID = 'gp-local-session-reader';
  if (document.getElementById(PANEL_ID)) return;
  const SESSION_KEYS = new Set(['sessionid', 'gamesessionid', 'playsessionid', 'launchsessionid']);
  const normalize = key => String(key).toLowerCase().replace(/[-_]/g, '');
  const allowed = url => url.protocol === 'https:' && !url.port && ['one-vv1935.com', '1play.gamedev-tech.cc'].includes(url.hostname);

  function extract(urls) {
    const found = new Map(), visited = new Set();
    const queue = urls.slice(0, 500).map(item => ({...item, depth: 0}));
    for (let i = 0; i < queue.length && i < 1200; i++) {
      const item = queue[i];
      if (typeof item.url !== 'string' || item.url.length > 32768 || visited.has(item.url)) continue;
      visited.add(item.url);
      let url;
      try { url = new URL(item.url, location.href); } catch { continue; }
      if (!allowed(url) && !['iframe', 'nested', 'iframe-document'].includes(item.kind)) continue;
      const hash = url.hash.slice(1);
      const parts = [url.search, hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash];
      for (const part of parts) {
        for (const [key, value] of new URLSearchParams(part)) {
          if (SESSION_KEYS.has(normalize(key)) && value.length >= 16 && value.length <= 8192 && !/[\s\u0000-\u001f\u007f]/.test(value)) {
            // Keep distinct candidates separate; never choose another session silently.
            if (!found.has(value) || item.priority < found.get(value).priority) found.set(value, {value, host: url.hostname, source: item.source, priority: item.priority});
           } else if (item.depth < 3) {
            // URLSearchParams decodes once; some launchers wrap a URL twice.
            let nested = value;
            for (let pass = 0; pass < 2 && /%[0-9a-f]{2}/i.test(nested); pass++) {
              try { const decoded = decodeURIComponent(nested); if (decoded === nested) break; nested = decoded; }
              catch { break; }
            }
            if (/^https:\/\//i.test(nested)) queue.push({...item, url: nested, kind: 'nested', depth: item.depth + 1});
          }
        }
      }
    }
    return [...found.values()].sort((a, b) => a.priority - b.priority);
  }

  function find() {
    const urls = [{url: location.href, source: 'Адрес открытой игры', priority: 0, kind: 'page'}];
    const docs = [document];
    let frames = 0;
    // Check the game page, its current iframe URLs and any same-origin nested frames.
    // Cross-origin iframe DOM is not accessible; the userscript also needs permission
    // to run independently on 1play.gamedev-tech.cc when Safari loads that frame.
    for (let i = 0; i < docs.length && i < 12; i++) {
      const doc = docs[i];
      if (i) {
        try { urls.push({url: doc.URL, source: 'Адрес открытого iframe', priority: 0, kind: 'iframe-document'}); } catch {}
      }
      for (const frame of [...doc.querySelectorAll('iframe')].slice(0, 100)) {
        frames++;
        for (const src of [frame.getAttribute('src'), frame.getAttribute('data-src')]) {
          if (src) urls.push({url: src, source: 'Текущий iframe', priority: 1, kind: 'iframe'});
        }
        try {
          const inner = frame.contentDocument;
          if (inner && !docs.includes(inner)) docs.push(inner);
        } catch {}
      }
      for (const link of [...doc.querySelectorAll('a[href]')].slice(0, 150)) {
        const href = link.getAttribute('href');
        if (href && /luckyjet|gamedev-tech|one-vv1935|sessionid|session_id/i.test(href)) {
          urls.push({url: href, source: 'Ссылка игрового запуска', priority: 2, kind: 'link'});
        }
      }
      try {
        const entries = doc.defaultView?.performance?.getEntriesByType('resource') || [];
        for (const entry of entries.slice(-500)) {
          let url;
          try { url = new URL(entry.name); } catch { continue; }
          if (allowed(url)) urls.push({url: entry.name, source: 'Журнал загрузок — может устареть', priority: 3, kind: 'resource'});
        }
      } catch {}
    }
    return {candidates: extract(urls), frames};
  }

  const host = document.createElement('div');
  host.id = PANEL_ID;
  host.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;max-width:calc(100vw - 16px);font:14px system-ui,sans-serif;';
  const root = host.attachShadow({mode: 'closed'});
  const style = document.createElement('style');
  style.textContent = '*{box-sizing:border-box}button{font:inherit;min-height:44px;border:1px solid #ad80ff;border-radius:12px;padding:9px 12px;background:#23123d;color:#fff;cursor:pointer}section{width:min(350px,calc(100vw - 16px));padding:14px;background:#130d20;color:#fff;border:1px solid #ad80ff;border-radius:16px;box-shadow:0 8px 30px #000a}header{display:flex;justify-content:space-between;align-items:center;gap:12px}h2{font-size:17px;margin:0}p{font-size:13px;line-height:1.45;color:#dfd1ef}textarea{width:100%;height:120px;background:#08050f;color:#fff;border:1px solid #70528e;border-radius:10px;padding:9px;resize:vertical;font:13px ui-monospace,monospace}select{width:100%;margin:8px 0;min-height:40px;background:#21142f;color:white;border:1px solid #70528e;border-radius:8px}nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}[hidden]{display:none!important}';
  const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Session ID';
  const panel = document.createElement('section'); panel.hidden = true;
  const header = document.createElement('header');
  const title = document.createElement('h2'); title.textContent = 'Сессия открытой игры';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть и скрыть ключ');
  header.append(title, close);
  const note = document.createElement('p'); note.textContent = 'Открой Lucky Jet, дождись загрузки и нажми «Найти». ID появится только на этом устройстве. Никому его не отправляй.';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const select = document.createElement('select'); select.hidden = true; select.setAttribute('aria-label', 'Выбрать найденную сессию');
  const value = document.createElement('textarea'); value.readOnly = true; value.hidden = true; value.autocomplete = 'off'; value.spellcheck = false; value.setAttribute('aria-label', 'Session-id');
  const actions = document.createElement('nav');
  const scan = document.createElement('button'); scan.type = 'button'; scan.textContent = 'Найти';
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Скопировать'; copy.disabled = true;
  actions.append(scan, copy);
  panel.append(header, note, status, select, value, actions);
  root.append(style, open, panel);
  (document.body || document.documentElement).append(host);
  let candidates = [];
  open.addEventListener('click', () => {open.hidden = true; panel.hidden = false;});
  close.addEventListener('click', () => {
    value.value = ''; value.hidden = true; select.replaceChildren(); select.hidden = true; copy.disabled = true;
    candidates = []; status.textContent = ''; panel.hidden = true; open.hidden = false;
  });
  scan.addEventListener('click', () => {
    const result = find(); candidates = result.candidates; select.replaceChildren(); value.value = ''; value.hidden = true; copy.disabled = true;
    select.hidden = candidates.length < 2;
    if (!candidates.length) {
      status.textContent = 'В открытых URL session-id не найден (iframe проверено: ' + result.frames + '). Открой Lucky Jet после входа по адресу one-vv1935.com/casino/play/v_1wingames:luckyjet и нажми «Найти» снова. Разреши Userscripts для one-vv1935.com и 1play.gamedev-tech.cc. Скрипт не видит закрытые заголовки и ответы API.';
      return;
    }
    candidates.forEach((candidate, index) => {
      const option = document.createElement('option'); option.value = String(index); option.textContent = `${index + 1}. ${candidate.source} · ${candidate.host}`; select.append(option);
    });
    value.value = candidates[0].value; value.hidden = false; copy.disabled = false;
    status.textContent = candidates.every(candidate => candidate.priority === 2) ? 'Найдено только в журнале загрузок: сессия может быть устаревшей. Действительность здесь не проверяется.' : candidates.length === 1 ? 'Найден session-id в адресе открытой страницы или iframe. Его действительность здесь не проверяется.' : `Найдено ${candidates.length} разных сессий. Предпочитай адрес открытой игры; журнал загрузок может устареть. Действительность здесь не проверяется.`;
  });
  select.addEventListener('change', () => {value.value = candidates[Number(select.value)]?.value || ''; copy.disabled = !value.value;});
  copy.addEventListener('click', async () => {
    if (!value.value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value.value); status.textContent = 'Скопировано. Храни ключ приватно.';
    } catch {
      value.focus(); value.select();
      status.textContent = 'Текст выделен. Нажми на него и выбери «Скопировать» в меню iPhone.';
    }
  });
})();