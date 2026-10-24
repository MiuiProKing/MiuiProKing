(function () {
  'use strict';
  const runtimeHelp = document.getElementById('runtime-help');
  window.addEventListener('error', event => {if (runtimeHelp) {runtimeHelp.hidden = false; runtimeHelp.textContent = 'HTML не смог завершить запуск JavaScript (' + (event.error?.name || 'ошибка') + '). Откройте файл в полноценном браузере. В предпросмотре ChatGPT или приложения «Файлы» сетевые запросы могут не выполняться.';}});
  const C = window.LuckyJetCore;
  const $ = id => document.getElementById(id);
  const PREFIX = 'luckyjet-full-logic-v1:';
  const GATEWAY = {"url": "https://crash-gateway-grm-cr.100hp.app/history", "headers": {"customer-id": "", "session-id": "", "accept": "application/json"}};
  const DEFAULT = {source: 'gateway', url: '', interval: 2500, depth: 2000, timezone: 'Europe/Kyiv', remember: false, connectionVersion: 3};
  const originalUrl = 'https://historique-luckyjet.shop/api/public/v1/rounds?game=luckyjet&limit=500';
  function read(key, fallback) {try {return JSON.parse(localStorage.getItem(PREFIX + key)) ?? fallback;} catch {return fallback;}}
  function save(key, value) {try {localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true;} catch {return false;}}
  const storedConfig = read('settings', {});
  const config = {...DEFAULT, ...storedConfig};
  if (storedConfig.connectionVersion !== 3) {config.source = 'gateway'; config.interval = 2500; config.connectionVersion = 3; save('settings', config);}
  if (!['gateway', 'original', 'custom'].includes(config.source)) config.source = 'gateway';
  if (![2500, 5000, 10000, 30000, 60000].includes(config.interval)) config.interval = 2500;
  if (![20, 50, 100, 500, 2000].includes(config.depth)) config.depth = 2000;
  if (!['Europe/Kyiv', 'UTC'].includes(config.timezone)) config.timezone = 'Europe/Kyiv';
  function supportedZone(zone) {try {new Intl.DateTimeFormat('en', {timeZone: zone}); return zone;} catch {return zone === 'Europe/Kyiv' ? 'Europe/Kiev' : 'UTC';}}
  let key = config.remember ? read('api-key', '') : '';
  const savedGateway = config.remember ? read('gateway-credentials', null) : null;
  let gatewayCustomer = savedGateway?.customer || GATEWAY.headers['customer-id'];
  let gatewaySession = savedGateway?.session || GATEWAY.headers['session-id'];
  const cached = read('cache', null);
  const state = {rows: [], mode: 'none', sourceName: '', namespace: '', prediction: null, running: false, inflight: false, timer: null, controller: null, generation: 0, failures: 0, lastSuccess: 0, gatewayPollStartedAt: 0, error: '', skipped: 0, historyLimit: 100, journal: read('journal', []), wasFresh: false, renderedTab: 'dashboard'};
  if (!Array.isArray(state.journal)) state.journal = [];
  state.journal = state.journal.filter(x => x && Number.isFinite(x.start) && Number.isFinite(x.end) && Number.isFinite(x.createdAt) && Number.isFinite(x.target)).slice(0, 200).map(x => x.status === 'pending' && Date.now() > x.end ? {...x, status: 'unknown'} : x);
  if (cached?.rows?.length) {try {state.rows = C.normalizeRows(cached.rows, {allowUntimed: true}).rows; state.mode = 'archive'; state.sourceName = cached.sourceName || 'Сохранённая история'; state.namespace = cached.namespace || 'import:cache';} catch {}}
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const number = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const colorClass = value => value >= 100 ? 'pink' : value >= 10 ? 'gold' : value >= 2 ? 'purple' : 'blue';
  const coefficient = value => `<span class="coef-pill ${colorClass(value)}">${number(value)}×</span>`;
  function formatTime(value, {date = false, seconds = false} = {}) {
    if (!Number.isFinite(value)) return '—';
    return new Intl.DateTimeFormat('ru-RU', {timeZone: supportedZone(config.timezone), ...(date ? {day: '2-digit', month: '2-digit'} : {}), hour: '2-digit', minute: '2-digit', ...(seconds ? {second: '2-digit'} : {})}).format(value);
  }
  const dayKey = value => Number.isFinite(value) ? new Intl.DateTimeFormat('sv-SE', {timeZone: supportedZone(config.timezone), year: 'numeric', month: '2-digit', day: '2-digit'}).format(value) : '';
  const rangeText = (start, end) => `${formatTime(start)} — ${formatTime(end)}${dayKey(start) !== dayKey(end) ? ' · ' + formatTime(end, {date: true}) : ''}`;
  function duration(ms) {if (!Number.isFinite(ms) || ms < 0) return '—'; if (ms < 60000) return Math.floor(ms / 1000) + ' с'; if (ms < 3600000) return (ms / 60000).toFixed(1) + ' мин'; return (ms / 3600000).toFixed(1) + ' ч';}
  function exactRows() {return state.rows.filter(row => Number.isFinite(row.timestamp) && (!row.estimated || row.timeKind === 'observed') && row.timestamp <= Date.now()).slice(0, config.depth);}
  function fresh() {
    const now = Date.now(), last = state.rows[0];
    return state.running && state.mode === 'live' && !state.error && !!last && Number.isFinite(last.timestamp) && now - state.lastSuccess < Math.max(30000, config.interval * 2 + 5000) && now - last.timestamp < 180000 && last.timestamp <= now + 10000;
  }
  function toast(message, error = false) {const el = $('toast'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => {el.hidden = true;}, 5500);}
  function namespace() {let hash = 2166136261; for (const char of (config.source === 'gateway' ? gatewayCustomer : config.url)) {hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619);} return config.source === 'gateway' ? 'api:gateway:' + (hash >>> 0).toString(16) : config.source === 'original' ? 'api:historique-luckyjet' : 'api:custom:' + (hash >>> 0).toString(16);}
  function persistRows() {if (state.mode === 'demo') return; save('cache', {rows: state.rows, sourceName: state.sourceName, namespace: state.namespace, savedAt: Date.now()});}
  const ruleNames = {'gold-cycle': 'Цикл коэффициентов от 10×', 'low-streak': 'Серия 15 раундов ниже 2×', 'high-cluster': 'Скопление коэффициентов от 20×', 'mid-fragile': 'Зона 5–9× · нестабильная база', 'mid-favorable': 'Зона 5–9× · благоприятная база', multi: 'Совместный анализ признаков', 'big-cycle': 'Медианный цикл 100×', 'big-cluster': 'Скопление 20× и 50×', 'big-poisson': 'Пуассоновская оценка интервала'};
  function translate(text) {return String(text ?? '').replaceAll('Cycle médian', 'Медианный интервал').replaceAll('Cycle 100x≈', 'Цикл 100× ≈ ').replaceAll('dernier il y a', 'после последнего').replaceAll('dernier', 'после последнего').replaceAll('évts', 'событий').replaceAll('Cluster chaud :', 'Скопление:').replaceAll('sur 80 tours', 'за 80 раундов').replaceAll('Hazard Poisson : P(retard)=', 'Оценка задержки: F(t)=').replaceAll('moy géo', 'геом. среднее').replaceAll('Moy. géo grosses cotes', 'Геом. среднее крупных').replaceAll('médiane', 'медиана').replaceAll('tours', 'раундов').replaceAll('min', ' мин').replaceAll('Zone 5x-9x géo', 'Зона 5–9×, геом. среднее').replaceAll('géo', 'геом. среднее').replaceAll('15 раундов <2x', '15 раундов <2×');}
  function calculate() {
    const rows = exactRows();
    if (rows.length < 20) {state.prediction = null; return;}
    const live = fresh();
    const now = live ? Date.now() : rows[0].timestamp;
    const previous = live && state.prediction?.generatedAt <= now ? state.prediction : null;
    if (state.running && !live) return;
    const prediction = C.predict(rows, previous, now, config.timezone);
    state.prediction = prediction;
    if (live && prediction) {
      const entries = [{kind: 'normal', target: prediction.estimatedCoef, start: prediction.estimatedAt, end: prediction.estimatedAt + prediction.windowMs, createdAt: prediction.generatedAt, score: prediction.reliability, rule: prediction.rule}];
      if (prediction.bigOpportunity) {const big = prediction.bigOpportunity; entries.push({kind: 'big', target: big.estimatedCoef, start: big.expectedAt, end: big.expectedAt + big.windowMs, createdAt: prediction.generatedAt, score: big.confidence, rule: big.rule});}
      for (const entry of entries) {
        const id = `${state.namespace}:${entry.kind}:${entry.createdAt}`;
        if (entry.start >= entry.createdAt && !state.journal.some(item => item.id === id)) state.journal.unshift({...entry, id, namespace: state.namespace, status: 'pending'});
      }
      state.journal = state.journal.slice(0, 200);
      evaluateJournal();
    }
  }
  function evaluateJournal() {
    if (!fresh()) return;
    state.journal = state.journal.map(entry => entry.namespace === state.namespace ? C.evaluateEntry(entry, state.rows) : entry);
    save('journal', state.journal);
  }
  function renderStatus() {
    renderLiveCoefficients();
    const live = fresh(), last = state.rows[0], kind = state.error ? 'error' : live ? 'live' : state.rows.length ? 'archive' : '';
    const title = state.error ? 'НЕТ СВЯЗИ' : live ? 'LIVE · API' : state.mode === 'collecting' ? 'API · СБОР ВРЕМЕНИ' : state.mode === 'demo' ? 'УЧЕБНЫЙ ПРИМЕР' : state.rows.length ? 'АРХИВ' : state.inflight ? 'ПОДКЛЮЧЕНИЕ' : 'НЕТ ДАННЫХ';
    $('feed-status').className = 'status-pill ' + kind;
    $('feed-status').innerHTML = '<span class="dot"></span>' + title;
    $('side-dot').className = 'dot ' + kind;
    $('side-status').textContent = live || state.mode === 'collecting' ? 'Поток подключён' : state.error ? 'Соединение прервано' : state.rows.length ? 'Разбор истории' : 'Данные не подключены';
    $('side-source').textContent = state.sourceName || 'API · JSON · CSV';
    $('feed-description').textContent = state.error || (live ? `${state.sourceName} · опрос ${config.interval / 1000} с` : state.mode === 'demo' ? 'Условные данные для проверки интерфейса' : last ? `${state.sourceName || 'История'} · последняя запись ${formatTime(last.timestamp, {date: true, seconds: true})}` : 'Подключите API или загрузите историю');
    $('feed-time').textContent = state.lastSuccess ? 'Обновлено ' + formatTime(state.lastSuccess, {seconds: true}) : 'Часовой пояс: ' + (config.timezone === 'UTC' ? 'UTC' : 'Киев');
    $('run-button').innerHTML = icon(state.running ? 'pause' : 'play') + `<span>${state.running ? 'Остановить' : 'Подключить API'}</span>`;
    $('onboarding').hidden = state.rows.length > 0;
    const notice = $('mode-notice');
    if (state.mode === 'demo') {notice.hidden = false; notice.textContent = 'Учебный пример. Коэффициенты и временные метки условные; это не игровой поток. Окна не записываются в журнал результатов.';}
    else if (state.rows.length && !live) {notice.hidden = false; notice.textContent = state.running ? 'Свежесть потока пока не подтверждена. История остаётся на экране; новые live-окна не создаются.' : 'Архивный расчёт по состоянию на последнюю запись. Это разбор загруженной истории, а не действующий сигнал на текущее время.';}
    else {notice.hidden = true; notice.textContent = '';}
    if (state.skipped) {notice.hidden = false; notice.textContent += ` Пропущено некорректных записей: ${state.skipped}.`;}
    if (config.source === 'gateway' && state.running && !state.error && state.rows.some(row => row.timeKind === 'unknown' || row.timeKind === 'observed')) {notice.hidden = false; notice.textContent = exactRows().length < 20 ? `Коэффициенты получены. API не передал время части старых раундов: оно не выдумывается. Временные метки новых раундов собираются при появлении: ${exactRows().length}/20 для расчёта.` : 'Для части раундов используется зафиксированное время появления в браузере. Такие метки отдельно помечены в истории; формулы De / Ce сохранены.';}
  }
  function renderLiveCoefficients() {
    const rows = state.rows.slice(0, 20), last = rows[0];
    const connected = state.running && state.lastSuccess && !state.error;
    const status = $('live-coefficients-status');
    status.textContent = state.error ? 'НЕТ СВЯЗИ' : state.mode === 'demo' ? 'УЧЕБНЫЙ ПРИМЕР' : connected ? 'API ПОДКЛЮЧЁН' : state.inflight ? 'ЗАПРОС API' : rows.length ? 'СОХРАНЁННАЯ ИСТОРИЯ' : 'НЕТ ДАННЫХ';
    status.className = 'status-pill ' + (state.error ? 'error' : connected ? 'live' : rows.length ? 'archive' : '');
    $('live-coefficient-value').textContent = last ? number(last.coefficient) + '×' : '—';
    $('live-coefficient-value').className = 'live-coefficient-value ' + (last ? colorClass(last.coefficient) : '');
    $('live-coefficient-caption').textContent = last ? state.mode === 'demo' ? 'Условный раунд · пример' : 'Последний полученный раунд' : 'Коэффициенты ещё не загружены';
    $('live-coefficients-list').innerHTML = rows.map((row, index) => `<span class="live-coefficient-chip ${colorClass(row.coefficient)}${index === 0 ? ' latest' : ''}" title="Раунд ${escape(row.id)}">${number(row.coefficient)}×</span>`).join('') || '<span class="live-feed-empty">Здесь появятся последние 20 коэффициентов</span>';
    $('live-connection-message').textContent = state.error ? state.error : connected ? `Получено ${state.rows.length} раундов · обновлено ${formatTime(state.lastSuccess, {seconds: true})} · опрос ${config.interval / 1000} с` : state.inflight ? 'Запрашиваем коэффициенты. Ждать 20 новых раундов для этой ленты не нужно.' : rows.length ? 'Поток остановлен. Нажмите «Переподключить», чтобы получать новые раунды.' : 'Нажмите «Переподключить». Коэффициенты появятся сразу после ответа API.';
    $('live-connection-error').hidden = !state.error;
  }
  function renderMetrics() {
    const rows = state.rows, values = rows.map(row => row.coefficient), n = rows.length;
    const setMetric = (id, value, suffix) => {$(id).innerHTML = escape(value) + '<small>' + suffix + '</small>';};
    setMetric('metric-latest', n ? number(values[0]) : '—', '×');
    $('metric-latest-sub').textContent = n ? formatTime(rows[0].timestamp, {seconds: true}) + ' · ' + (state.mode === 'demo' ? 'пример' : rows[0].timeKind === 'observed' ? 'получен в браузере' : Number.isFinite(rows[0].timestamp) ? 'завершённый раунд' : 'время API не передано') : 'Ожидаем данные';
    setMetric('metric-avg', n ? number(C.mean(values)) : '—', '×');
    $('metric-median').textContent = 'Медиана ' + (n ? number(C.median(values)) + '×' : '—');
    const twos = values.filter(v => v >= 2).length, tens = values.filter(v => v >= 10).length;
    setMetric('metric-two', n ? (twos / n * 100).toFixed(1) : '—', '%');
    setMetric('metric-ten', n ? (tens / n * 100).toFixed(1) : '—', '%');
    $('metric-two-sub').textContent = n ? `${twos} из ${n} записей` : 'По доступной истории';
    $('metric-max').textContent = 'Максимум ' + (n ? number(C.maximum(values)) + '×' : '—');
    $('data-count').textContent = n.toLocaleString('ru-RU') + ' раундов в истории';
    $('nav-count').textContent = n;
    let streak = 0; for (const value of values) {if (value >= 2) break; streak++;}
    $('streak-value').textContent = n ? streak : '—';
    $('exact-value').textContent = exactRows().length;
    $('recent-rounds').innerHTML = rows.slice(0, 20).map(row => `<div class="round-card ${colorClass(row.coefficient)}" title="${escape(row.id)}"><b>${number(row.coefficient)}×</b><small>${formatTime(row.timestamp, {seconds: true})}</small></div>`).join('') || '<p class="quiet-note">Здесь будут последние коэффициенты.</p>';
    const babel = values.length >= 3 ? Math.min(C.mean(values.slice(0, 3)) * 1.10, 2.4).toFixed(2) + '×' : null;
    $('babel-comparison').textContent = babel ? 'На текущей истории: ' + babel + ' (сравнительная формула).' : 'Нужны 3 раунда.';
  }
  function renderPrediction() {
    const p = state.prediction, live = fresh();
    $('target-coef').innerHTML = (p ? number(p.estimatedCoef) : '—') + '<span>×</span>';
    $('score-value').textContent = p ? p.reliability : '—';
    $('score-ring').style.setProperty('--score', (p ? p.reliability * 3.6 : 0) + 'deg');
    $('prediction-rule').textContent = p ? ruleNames[p.rule] || 'Расчёт по исходным правилам' : `Нужно 20 раундов со временем · ${exactRows().length}/20`;
    $('prediction-mode').textContent = p ? live ? 'АКТИВНОЕ ОКНО' : state.mode === 'demo' ? 'ПРИМЕР' : 'АРХИВНЫЙ РАСЧЁТ' : 'ОЖИДАНИЕ';
    $('prediction-mode').className = 'tag' + (p && live ? ' live' : '');
    $('prediction-window').textContent = p ? rangeText(p.estimatedAt, p.estimatedAt + p.windowMs) : '—';
    $('prediction-basis').textContent = p ? translate(p.basis) : 'Расчёт появится после загрузки или наблюдения минимум 20 раундов с временными метками.';
    $('prediction-lock').textContent = p ? `${exactRows().length} ${state.mode === 'demo' ? 'учебных' : 'учтённых'} раундов · балл правил, не вероятность` : 'Окно сохраняется до завершения';
    const big = p?.bigOpportunity;
    $('big-target').innerHTML = big ? number(big.estimatedCoef, 0) + '<span>×</span>' : '100<span>×+</span>';
    $('big-heading').textContent = big ? ruleNames[big.rule] || 'Условия Ce выполнены' : 'Ожидаем сочетание условий';
    $('big-basis').textContent = big ? translate(big.reason) : 'Медианные интервалы, MAD, скопления 20× / 50× и пуассоновская оценка.';
    $('big-window').textContent = big ? rangeText(big.expectedAt, big.expectedAt + big.windowMs) : '—';
    $('big-score').textContent = big ? big.confidence : '—';
    renderCountdown();
  }
  function renderCountdown() {
    const p = state.prediction;
    if (!p) {$('prediction-countdown').textContent = '—'; return;}
    if (!fresh()) {$('countdown-label').textContent = 'Режим'; $('prediction-countdown').textContent = state.mode === 'demo' ? 'Учебный' : 'История'; return;}
    const now = Date.now(), before = now < p.estimatedAt, remaining = (before ? p.estimatedAt : p.estimatedAt + p.windowMs) - now;
    $('countdown-label').textContent = before ? 'До начала' : 'До конца';
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    $('prediction-countdown').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  function renderChart() {
    const rows = state.rows.slice(0, Number($('chart-count').value)).reverse();
    if (!rows.length) {$('chart').innerHTML = '<div class="empty-chart">График появится после загрузки истории</div>'; $('chart-span').textContent = '—'; return;}
    const width = 1000, height = 182, top = 7, bottom = 154, left = 29, right = 8;
    const topValue = Math.max(10, C.maximum(rows.map(row => row.coefficient))), logMax = Math.log10(topValue) + .05;
    const y = value => bottom - Math.log10(Math.max(1, value)) / logMax * (bottom - top);
    const step = (width - left - right) / rows.length, barWidth = Math.max(1, step - Math.min(3, step * .2));
    const colors = {blue: '#5c9bce', purple: '#9474c6', gold: '#cfaa6c', pink: '#d28caf'};
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График последних ${rows.length} коэффициентов" preserveAspectRatio="none">`;
    for (const line of [1, 2, 10, 100, 1000, 10000]) {if (line > topValue * 1.1) continue; const position = y(line); svg += `<line x1="${left}" y1="${position}" x2="${width - right}" y2="${position}" stroke="#242a39" stroke-dasharray="3 5"/><text x="1" y="${position + 3}" fill="#646f87" font-size="8">${line}×</text>`;}
    rows.forEach((row, i) => {const position = y(row.coefficient); svg += `<rect x="${(left + i * step).toFixed(2)}" y="${position.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(2, bottom - position).toFixed(2)}" rx="1.6" fill="${colors[colorClass(row.coefficient)]}"><title>${number(row.coefficient)}× · ${formatTime(row.timestamp, {seconds: true})} · ${escape(row.id)}</title></rect>`;});
    svg += `<text x="${left}" y="178" fill="#687289" font-size="8">${formatTime(rows[0].timestamp)}</text><text x="${width - right}" y="178" fill="#687289" font-size="8" text-anchor="end">${formatTime(rows[rows.length - 1].timestamp)}</text></svg>`;
    $('chart').innerHTML = svg;
    $('chart-span').textContent = `${rows.length} раундов · ${Number.isFinite(rows[0].timestamp) && Number.isFinite(rows[rows.length - 1].timestamp) ? duration(rows[rows.length - 1].timestamp - rows[0].timestamp) : 'время части раундов отсутствует'}`;
  }
  function renderGaps() {
    const threshold = Number($('gap-threshold').value), rows = [...exactRows()].reverse(), gap = C.gapStats(rows, threshold);
    $('gap-median').textContent = gap.count >= 2 ? duration(gap.medGap) : '—';
    $('gap-mad').textContent = gap.count >= 3 ? duration(gap.madGap) : '—';
    $('gap-age').textContent = gap.last ? duration((fresh() ? Date.now() : rows[rows.length - 1]?.timestamp ?? Date.now()) - gap.last) : '—';
    const events = rows.map((row, index) => ({...row, index})).filter(row => row.coefficient >= threshold);
    $('gap-table').innerHTML = events.map((row, i) => ({...row, gap: i ? row.timestamp - events[i - 1].timestamp : null, between: i ? row.index - events[i - 1].index - 1 : null})).reverse().slice(0, 6).map(row => `<tr><td>${formatTime(row.timestamp, {seconds: true})}</td><td>${coefficient(row.coefficient)}</td><td>${row.gap == null ? '—' : duration(row.gap)}</td><td>${row.between ?? '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-cell">Событий по выбранному порогу пока нет</td></tr>';
  }
  function filteredRows() {const date = $('history-date').value, min = Math.max(1, Number($('history-min').value) || 1), search = $('history-search').value.trim().toLowerCase(); return state.rows.filter(row => row.coefficient >= min && (!date || dayKey(row.timestamp) === date) && (!search || row.id.toLowerCase().includes(search)));}
  function renderHistory() {
    const rows = filteredRows(), visible = rows.slice(0, state.historyLimit);
    $('history-table').innerHTML = visible.map(row => `<tr><td>${formatTime(row.timestamp, {date: true, seconds: true})}</td><td>${coefficient(row.coefficient)}</td><td title="${escape(row.id)}">${escape(row.id.length > 48 ? row.id.slice(0, 45) + '…' : row.id)}</td><td>${state.mode === 'demo' ? 'Учебное' : !Number.isFinite(row.timestamp) ? 'Не передано API' : row.timeKind === 'observed' ? 'Время появления' : row.estimated ? '<span class="result-unknown">Приблизительное</span>' : 'Время источника'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-cell">Записей по выбранным фильтрам нет</td></tr>';
    $('history-summary').textContent = `Показано ${visible.length} из ${rows.length} · всего ${state.rows.length}`;
    $('more-history').hidden = visible.length >= rows.length;
  }
  function renderJournal() {
    for (const type of ['hit', 'pending', 'unknown']) $('journal-' + type).textContent = state.journal.filter(entry => entry.status === type).length;
    $('journal-table').innerHTML = state.journal.map(entry => `<tr><td>${formatTime(entry.createdAt, {date: true, seconds: true})}<small style="display:block;color:#69748a">${entry.kind === 'big' ? 'Ce · большое окно' : 'De · обычное окно'}</small></td><td>${coefficient(entry.target)}</td><td>${rangeText(entry.start, entry.end)}</td><td class="result-${escape(entry.status)}">${entry.status === 'hit' ? '✓ Цель достигнута' : entry.status === 'unknown' ? 'Не подтверждено' : 'Ожидает проверки'}</td><td>${entry.status === 'hit' ? number(entry.result) + '× · ' + formatTime(entry.resultAt, {seconds: true}) + '<small style="display:block;color:#657188">' + escape(entry.roundId) + '</small>' : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-cell">Пока нет окон, созданных при свежем потоке API</td></tr>';
  }
  function render() {document.querySelectorAll('[data-zone]').forEach(node => {node.textContent = config.timezone === 'UTC' ? 'UTC' : 'Киев';}); renderStatus(); renderMetrics(); renderPrediction(); renderChart(); renderGaps(); renderHistory(); renderJournal();}
  function tab(name) {if (!['dashboard', 'history', 'journal', 'logic', 'sources'].includes(name)) name = 'dashboard'; state.renderedTab = name; document.querySelectorAll('.view').forEach(view => {view.classList.toggle('active', view.id === 'view-' + name);}); document.querySelectorAll('.nav-item[data-tab]').forEach(button => {button.classList.toggle('active', button.dataset.tab === name);}); try {if (location.hash !== '#' + name && !['about:', 'data:', 'file:'].includes(location.protocol)) history.replaceState(null, '', '#' + name);} catch {} try {window.scrollTo({top: 0, behavior: 'auto'});} catch {}}
  async function requestData() {
    if (!state.running || state.inflight) return;
    state.inflight = true; const controller = new AbortController(); state.controller = controller;
    const generation = state.generation;
    const requestStartedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), 12000);
    renderStatus();
    try {
      const url = config.source === 'gateway' ? GATEWAY.url : config.source === 'original' ? originalUrl : config.url;
      const headers = {Accept: 'application/json'};
      if (config.source === 'gateway') {headers['customer-id'] = gatewayCustomer; headers['session-id'] = gatewaySession;} else if (key) headers.Authorization = 'Bearer ' + key;
      const response = await fetch(url, {method: 'GET', headers, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'});
      if (!response.ok) {const errorBody = response.status === 403 ? await response.text() : ''; const messages = {400: 'Источник отклонил параметры запроса (400).', 401: config.source === 'gateway' ? 'Источник не принял сессию (401). Обновите Session ID в настройках.' : 'Нужен действующий API ключ выбранного источника (401).', 403: /1010|cloudflare/i.test(errorBody) ? 'Cloudflare отклонил запрос к источнику (403/1010). Получение коэффициентов не подтверждено.' : 'Источник отказал в доступе (403). Проверьте сессию в настройках.', 429: 'Превышен лимит API (429). Частота запросов временно снижена.'}; throw Error(messages[response.status] || 'Ошибка API: HTTP ' + response.status);}
      const payload = await response.json();
      const now = Date.now();
      const normalized = config.source === 'gateway' ? C.normalizeGateway(payload, state.rows, now, state.gatewayPollStartedAt) : C.normalizeRows(payload, {requireId: true});
      if (generation !== state.generation || !state.running) return;
      if (Number.isFinite(normalized.rows[0].timestamp) && normalized.rows[0].timestamp > now + 10000) throw Error('Время источника опережает часы устройства. Проверьте дату и время.');
      state.rows = C.mergeRows(state.rows, normalized.rows);
      state.skipped = normalized.skipped; state.lastSuccess = now; state.failures = 0; state.error = '';
      if (config.source === 'gateway') state.gatewayPollStartedAt = requestStartedAt;
      const demo = payload.demo === true || ['example', 'demo', 'simulation'].includes(payload.mode);
      state.mode = demo ? 'demo' : !Number.isFinite(state.rows[0].timestamp) ? 'collecting' : now - state.rows[0].timestamp < 180000 ? 'live' : 'archive';
      if (demo) {state.prediction = null; state.running = false;}
      if (state.mode === 'archive') state.error = 'Последний раунд старше 3 минут. Показываем архив.';
      calculate(); evaluateJournal(); persistRows(); render();
    } catch (error) {
      if (generation !== state.generation || !state.running) return;
      state.failures++;
      state.error = error?.name === 'AbortError' ? 'Источник не ответил за 12 секунд. Повторим запрос.' : error instanceof TypeError ? 'Браузер не смог прочитать API. Проверьте сеть и CORS; доступен импорт JSON / CSV.' : error.message || 'Не удалось прочитать API.';
      render();
    } finally {
      clearTimeout(timeout);
      if (generation === state.generation) {state.inflight = false; state.controller = null; if (state.running) {const delay = state.failures ? Math.min(60000, config.interval * 2 ** Math.min(state.failures, 4)) : config.interval; state.timer = setTimeout(requestData, delay);} renderStatus();}
    }
  }
  function stop({quiet = false} = {}) {state.running = false; state.generation++; clearTimeout(state.timer); state.controller?.abort(); state.controller = null; state.inflight = false; state.error = ''; if (state.mode === 'live') state.mode = 'archive'; if (!quiet) {state.prediction = null; calculate(); render();}}
  function start() {
    if (config.source === 'gateway' && (!gatewayCustomer || !gatewaySession)) {openSettings(); $('settings-error').textContent = 'Заполните Customer ID и Session ID.'; return;}
    if (config.source === 'original' && !key) {openSettings(); $('settings-error').textContent = 'Для API оригинального сервиса нужен ваш ключ. Можно также импортировать историю.'; $('setting-key').focus(); return;}
    if (config.source === 'custom' && !config.url) {openSettings(); $('settings-error').textContent = 'Укажите адрес вашего JSON endpoint.'; return;}
    stop({quiet: true});
    const nextNamespace = namespace();
    if (state.namespace !== nextNamespace) {state.rows = []; state.prediction = null; state.skipped = 0;}
    state.namespace = nextNamespace; state.sourceName = config.source === 'gateway' ? 'LuckyJet · Crash Gateway' : config.source === 'original' ? 'Historique LuckyJet' : 'Мой JSON endpoint';
    state.mode = state.rows.length ? 'archive' : 'none'; state.running = true; state.failures = 0; state.error = ''; state.lastSuccess = 0; state.gatewayPollStartedAt = 0;
    render(); requestData();
  }
  let lastFocus;
  function sourceFields() {$('custom-url-label').hidden = $('setting-source').value !== 'custom'; $('gateway-fields').hidden = $('setting-source').value !== 'gateway'; $('api-key-label').hidden = $('setting-source').value === 'gateway'; $('settings-note').textContent = $('setting-source').value === 'gateway' ? 'Введите свои Customer ID и Session ID. В открытом исходнике данных сессии нет. Customer ID и Session ID отправляются только в Crash Gateway.' : 'API ключ отправляется только выбранному источнику. Ключи и данные сессии не попадают в экспорт истории.';}
  function openSettings() {lastFocus = document.activeElement; $('setting-source').value = config.source; $('setting-url').value = config.url; $('setting-key').value = key; $('setting-customer').value = gatewayCustomer; $('setting-session').value = gatewaySession; $('setting-remember').checked = !!config.remember; $('setting-interval').value = config.interval; $('setting-depth').value = config.depth; $('setting-timezone').value = config.timezone; $('settings-error').textContent = ''; sourceFields(); $('settings-dialog').hidden = false; document.body.style.overflow = 'hidden'; $('setting-source').focus();}
  function closeSettings() {$('settings-dialog').hidden = true; document.body.style.overflow = ''; lastFocus?.focus();}
  $('setting-source').addEventListener('change', () => {sourceFields(); $('setting-key').value = ''; $('setting-remember').checked = false;});
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const source = $('setting-source').value, customUrl = $('setting-url').value.trim(), newKey = $('setting-key').value.trim();
    if (source === 'gateway' && (!$('setting-customer').value.trim() || !$('setting-session').value.trim())) {$('settings-error').textContent = 'Заполните Customer ID и Session ID.'; return;}
    if (source === 'custom') {try {const parsed = new URL(customUrl); if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw Error();} catch {$('settings-error').textContent = 'Нужен HTTPS-адрес JSON endpoint.'; return;}}
    if (source === 'original' && !newKey) {$('settings-error').textContent = 'Введите API ключ либо выберите импорт истории.'; return;}
    stop({quiet: true});
    Object.assign(config, {source, url: source === 'custom' ? customUrl : '', interval: Number($('setting-interval').value), depth: Number($('setting-depth').value), timezone: $('setting-timezone').value, remember: $('setting-remember').checked});
    save('settings', config);
    if (source === 'gateway') {gatewayCustomer = $('setting-customer').value.trim(); gatewaySession = $('setting-session').value.trim(); if (config.remember) save('gateway-credentials', {customer: gatewayCustomer, session: gatewaySession}); else {try {localStorage.removeItem(PREFIX + 'gateway-credentials');} catch {}}}
    else {key = newKey; if (config.remember) save('api-key', key); else {try {localStorage.removeItem(PREFIX + 'api-key');} catch {}}}
    state.prediction = null; closeSettings(); start();
  });
  function download(filename, content, type = 'application/json') {const blob = new Blob([content], {type: type + ';charset=utf-8'}), url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);}
  function exportRows(type) {
    const rows = state.renderedTab === 'history' ? filteredRows() : state.rows;
    if (!rows.length) {toast('Сначала загрузите историю.', true); return;}
    if (type === 'json') {download('LuckyJet_history.json', JSON.stringify({format: 'LuckyJet Full Logic v1.1', exportedAt: new Date().toISOString(), mode: state.mode === 'demo' ? 'example' : 'archive', demo: state.mode === 'demo', timezone: config.timezone, rounds: rows.map(row => ({round_id: row.id, coefficient: row.coefficient, at: Number.isFinite(row.timestamp) ? new Date(row.timestamp).toISOString() : null, estimated: row.estimated, timeKind: row.timeKind, observedSince: row.observedSince})), calculation: state.prediction}, null, 2));}
    else {const cell = value => {let text = String(value); if (/^[=+\-@]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"';}; const csv = ['round_id,coefficient,at,estimated', ...rows.map(row => [row.id, row.coefficient, Number.isFinite(row.timestamp) ? new Date(row.timestamp).toISOString() : '', row.estimated].map(cell).join(','))].join('\r\n'); download(state.mode === 'demo' ? 'LuckyJet_DEMO_history.csv' : 'LuckyJet_history.csv', '\uFEFF' + csv, 'text/csv');}
  }
  const exampleValues = [1.14, 1.52, 1.42, 1.76, 2.96, 1.16, 1.05, 8.67, 2.30, 1.07, 3.57, 1.31, 5.54, 1.15, 1.54, 1.99, 2.67, 1.71, 13.00, 2.70, 3.20, 1.05, 3.07, 9.60, 1.48, 1.86, 1.00, 1.00, 1.07, 1.00, 1.08, 1.18, 1.47, 1.98, 1.35, 48.36, 7.34, 1.06, 1.62, 1.55, 1.01, 1.35, 1.05, 1.00, 1.39, 1.00, 23.76, 1.93, 2.75, 1.03];
  function examplePayload() {const at = Math.floor(Date.now() / 60000) * 60000; return {mode: 'example', demo: true, note: 'Учебные значения и условные временные метки. Не игровой поток.', rounds: exampleValues.map((coefficient, index) => ({round_id: 'DEMO-' + String(50 - index).padStart(3, '0'), coefficient, at: new Date(at - index * 21000).toISOString()}))};}
  function loadExample() {stop({quiet: true}); state.rows = C.normalizeRows(examplePayload()).rows; state.mode = 'demo'; state.namespace = 'demo'; state.sourceName = 'Учебный пример'; state.prediction = null; state.lastSuccess = 0; state.skipped = 0; calculate(); render(); tab('dashboard'); toast('Учебный пример открыт. Эти расчёты не записываются в журнал.');}
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('Файл слишком большой. Максимум 10 МБ.');
      const text = await file.text(), payload = file.name.toLowerCase().endsWith('.json') || /^\s*[\[{]/.test(text) ? JSON.parse(text) : C.csvRows(text);
      const result = C.normalizeRows(payload);
      stop({quiet: true}); state.rows = result.rows; state.mode = payload.demo || payload.mode === 'example' || /DEMO/i.test(file.name) ? 'demo' : 'archive'; state.namespace = 'import:' + Date.now(); state.sourceName = file.name; state.prediction = null; state.lastSuccess = 0; state.skipped = result.skipped;
      calculate(); persistRows(); closeSettings(); render(); tab('dashboard'); toast(`Загружено ${state.rows.length} раундов${result.skipped ? ', пропущено ' + result.skipped : ''}.`);
    } catch (error) {toast(error.message || 'Не удалось прочитать файл.', true);} finally {event.target.value = '';}
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action],[data-tab]'); if (!button) return;
    if (button.dataset.tab) {tab(button.dataset.tab); return;}
    const action = button.dataset.action;
    if (action === 'settings') openSettings();
    else if (action === 'close-settings') closeSettings();
    else if (action === 'toggle-run') state.running ? stop() : start();
    else if (action === 'reconnect') start();
    else if (action === 'import') $('import-file').click();
    else if (action === 'demo') loadExample();
    else if (action === 'export-json') exportRows('json');
    else if (action === 'export-csv') exportRows('csv');
    else if (action === 'export-example') download('LuckyJet_DEMO_format_example.json', JSON.stringify(examplePayload(), null, 2));
    else if (action === 'export-journal') download('LuckyJet_window_journal.json', JSON.stringify({format: 'LuckyJet Full Logic journal v1', exportedAt: new Date().toISOString(), windows: state.journal}, null, 2));
    else if (action === 'more-history') {state.historyLimit += 100; renderHistory();}
    else if (action === 'reset-filters') {$('history-date').value = ''; $('history-min').value = '1'; $('history-search').value = ''; state.historyLimit = 100; renderHistory();}
    else if (action === 'clear-journal') {state.journal = []; save('journal', state.journal); renderJournal(); toast('Локальный журнал очищен.');}
    else if (action === 'recalculate') {const previous = state.prediction; calculate(); renderPrediction(); if (!state.prediction) toast('Нужны минимум 20 точных раундов.', true); else toast(previous === state.prediction && fresh() ? 'Текущее окно сохраняется до завершения, как в оригинале.' : 'Расчёт обновлён по текущей истории.');}
  });
  $('settings-dialog').addEventListener('click', event => {if (event.target === $('settings-dialog')) closeSettings();});
  document.addEventListener('keydown', event => {
    if ($('settings-dialog').hidden) return;
    if (event.key === 'Escape') {closeSettings(); return;}
    if (event.key === 'Tab') {const focusable = [...$('settings-dialog').querySelectorAll('button,input,select')].filter(el => !el.disabled && el.getClientRects().length), first = focusable[0], last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();} else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}}
  });
  for (const id of ['history-date', 'history-min', 'history-search']) $(id).addEventListener('input', () => {state.historyLimit = 100; renderHistory();});
  $('chart-count').addEventListener('change', renderChart); $('gap-threshold').addEventListener('change', renderGaps);
  window.addEventListener('hashchange', () => tab(location.hash.slice(1)));
  window.addEventListener('online', () => {if (state.running && !state.inflight) {clearTimeout(state.timer); requestData();}});
  document.addEventListener('visibilitychange', () => {if (!document.hidden && state.running && !state.inflight) {clearTimeout(state.timer); requestData();}});
  window.addEventListener('beforeunload', () => {state.controller?.abort(); persistRows(); save('journal', state.journal);});
  $('engine-source').textContent = $('analysis-core').textContent;
  calculate(); render(); tab(location.hash.slice(1) || 'dashboard');
  function tick() {$('kyiv-clock').textContent = new Intl.DateTimeFormat('ru-RU', {timeZone: supportedZone('Europe/Kyiv'), hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).format(Date.now()); renderCountdown(); const active = fresh(); if (active !== state.wasFresh) {state.wasFresh = active; renderStatus(); renderPrediction();}}
  tick(); setInterval(tick, 1000);
  setInterval(() => {if (fresh()) {calculate(); evaluateJournal(); renderPrediction(); renderGaps(); renderJournal();}}, 8000);
  if (config.source === 'gateway') start();
  if (runtimeHelp) runtimeHelp.hidden = true;
})();
