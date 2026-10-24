/* LuckyJet Full Logic. Independent implementation of the public formulas inspected 2026-10-24.
   Reference: historique-luckyjet.shop/assets/PredictionPanel-CBGsolff.js
   No trained model, secret server code or random predictions are included. */
(function (root) {
  'use strict';
  const MINUTE = 60000;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  const sigma = values => {if (values.length < 2) return 0; const center = mean(values); return Math.sqrt(mean(values.map(v => (v - center) ** 2)));};
  const mad = values => {if (values.length < 2) return 0; const center = median(values); return median(values.map(v => Math.abs(v - center)));};
  const geometric = values => values.length ? Math.exp(mean(values.map(v => Math.log(Math.max(v, 1.001))))) : 0;
  const maximum = values => values.length ? values.reduce((a, b) => b > a ? b : a, -Infinity) : 0;
  function ema(values, alpha) {
    if (!values.length) return 0;
    let value = values[values.length - 1];
    for (let i = values.length - 2; i >= 0; i--) value = alpha * values[i] + (1 - alpha) * value;
    return value;
  }
  const clocks = new Map();
  function clockParts(timestamp, timezone = 'Europe/Kyiv') {
    if (!clocks.has(timezone)) {
      let zone = timezone;
      try {new Intl.DateTimeFormat('en', {timeZone: zone});} catch (error) {if (zone !== 'Europe/Kyiv') throw error; zone = 'Europe/Kiev';}
      clocks.set(timezone, new Intl.DateTimeFormat('en-GB', {timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}));
    }
    return Object.fromEntries(clocks.get(timezone).formatToParts(timestamp).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  }
  function buckets(rounds, selector) {
    const grouped = new Map();
    for (const row of rounds) {
      const key = selector(row), group = grouped.get(key) || {values: [], goldenCount: 0, megaCount: 0};
      group.values.push(row.coefficient);
      if (row.coefficient >= 10) group.goldenCount++;
      if (row.coefficient >= 100) group.megaCount++;
      grouped.set(key, group);
    }
    return new Map([...grouped].map(([key, group]) => [key, {count: group.values.length, goldenCount: group.goldenCount, megaCount: group.megaCount, avg: geometric(group.values), max: maximum(group.values)}]));
  }
  function gapStats(rounds, threshold) {
    const events = rounds.filter(row => row.coefficient >= threshold).sort((a, b) => a.timestamp - b.timestamp);
    const gaps = events.slice(1).map((row, i) => row.timestamp - events[i].timestamp);
    return {avgGap: mean(gaps), medGap: median(gaps), stdGap: sigma(gaps), madGap: mad(gaps), last: events[events.length - 1]?.timestamp ?? null, count: events.length};
  }
  function bigOpportunity(rounds, now = Date.now()) {
    const chronological = [...rounds].sort((a, b) => a.timestamp - b.timestamp), options = [];
    const cycle = gapStats(chronological, 100);
    if (cycle.count >= 5 && cycle.last && cycle.medGap > 0) {
      const expected = cycle.last + cycle.medGap, offset = expected - now;
      const spread = clamp(cycle.madGap * 1.4826 || cycle.medGap * .35, 2 * MINUTE, 12 * MINUTE);
      const elapsed = now - cycle.last;
      if (cycle.madGap > 0 && cycle.madGap < cycle.medGap * .5 && (Math.abs(offset) <= spread * .7 || elapsed >= cycle.medGap * .9)) {
        const proximity = clamp(1 - Math.abs(offset) / Math.max(spread, 1), 0, 1);
        const score = clamp(55 + Math.min(10, cycle.count) + proximity * 12, 55, 82);
        options.push({expectedAt: offset > 0 ? expected : now + Math.max(2 * MINUTE, spread * .4), windowMs: clamp(spread, 3 * MINUTE, 10 * MINUTE), estimatedCoef: 100, confidence: Math.round(score), rule: 'big-cycle', reason: `Cycle 100x≈${(cycle.medGap / MINUTE).toFixed(1)}min — dernier il y a ${(elapsed / MINUTE).toFixed(1)}min (${cycle.count} évts)`});
      }
    }
    const tail = chronological.slice(-80);
    const count20 = tail.filter(row => row.coefficient >= 20).length, count50 = tail.filter(row => row.coefficient >= 50).length;
    if (count50 >= 3 && count20 >= 6) {
      options.push({expectedAt: now + 3 * MINUTE, windowMs: 6 * MINUTE, estimatedCoef: 120, confidence: Math.round(clamp(55 + count50 * 5 + count20, 55, 82)), rule: 'big-cluster', reason: `Cluster chaud : ${count20}×≥20x + ${count50}×≥50x sur 80 tours`});
    }
    const hundreds = chronological.filter(row => row.coefficient >= 100);
    if (hundreds.length >= 4 && cycle.last && chronological.length >= 80) {
      const elapsed = now - cycle.last, duration = chronological[chronological.length - 1].timestamp - chronological[0].timestamp;
      const rate = duration > 0 ? hundreds.length / duration : 0;
      if (rate > 0) {
        const delayCdf = 1 - Math.exp(-rate * elapsed);
        if (delayCdf >= .75) {
          const wait = clamp(1 / rate, 90000, 8 * MINUTE);
          options.push({expectedAt: now + wait, windowMs: clamp(wait * .8, 3 * MINUTE, 7 * MINUTE), estimatedCoef: 100, confidence: Math.round(clamp(50 + delayCdf * 30, 50, 80)), rule: 'big-poisson', reason: `Hazard Poisson : P(retard)=${(delayCdf * 100).toFixed(0)}% (λ⁻¹≈${(1 / rate / MINUTE).toFixed(1)}min)`});
        }
      }
    }
    if (!options.length) return null;
    options.sort((a, b) => b.confidence - a.confidence);
    const chosen = options[0];
    if (options.length < 2 && chosen.confidence < 75) return null;
    if (options.length >= 2) chosen.confidence = Math.min(92, chosen.confidence + 5);
    return chosen;
  }
  function predict(rounds, previous = null, now = Date.now(), timezone = 'Europe/Kyiv') {
    if (rounds.length < 20) return null;
    if (previous && now < Math.max(previous.estimatedAt + previous.windowMs, previous.generatedAt + MINUTE)) return previous;
    const ordered = [...rounds].sort((a, b) => b.timestamp - a.timestamp), values = ordered.map(row => row.coefficient);
    const med = median(values), geo = geometric(values), last20 = values.slice(0, 20), last50 = values.slice(0, 50);
    const avg50 = mean(last50), ema20 = ema(last20, .25), ema50 = ema(last50, .12), deviation = sigma(last50), absolute = mad(last50);
    const gold = gapStats(ordered, 10), elapsed = gold.last ? now - gold.last : Infinity;
    const hours = buckets(ordered, row => clockParts(row.timestamp, timezone).hour), minutes = buckets(ordered, row => clockParts(row.timestamp, timezone).minute);
    const clock = clockParts(now, timezone), hour = hours.get(clock.hour), minute = minutes.get((clock.minute + 2) % 60);
    const low15 = values.slice(0, 15).length === 15 && values.slice(0, 15).every(value => value < 2);
    const high30 = ordered.slice(0, 30).filter(row => row.coefficient >= 20), big = bigOpportunity(rounds, now);
    const result = (target, score, expectedAt, windowMs, pattern, basis, rule, high = 82, middle = 66) => ({estimatedCoef: +target.toFixed(2), confidence: score >= high ? 'Élevé' : score >= middle ? 'Moyen' : 'Faible', reliability: score, estimatedAt: expectedAt, windowMs, pattern, basis, generatedAt: now, bigOpportunity: big, rule});
    if (gold.medGap > 0 && gold.last) {
      const offset = gold.last + gold.medGap - now, spread = clamp(gold.madGap * 1.4826 || gold.medGap * .55, MINUTE, 4 * MINUTE);
      if (gold.count >= 8 && gold.madGap > 0 && gold.madGap < gold.medGap * .6 && Math.abs(offset) <= spread * .6) {
        const divisor = high30.length >= 3 ? 2 : high30.length >= 1 ? 3 : 4;
        const target = clamp(maximum(ordered.slice(0, 80).map(row => row.coefficient)) / divisor, 2, 20);
        const base = clamp(60 - Math.abs(offset) / spread * 15, 40, 62), hourBonus = hour && hour.avg > geo ? 3 : 0;
        const score = Math.round(clamp(base + hourBonus + clamp(gold.count / 20, 0, 4), 40, 68));
        return result(target, score, offset > 0 ? now + Math.max(offset, 90000) : now + 2 * MINUTE, clamp(gold.medGap * .25, 90000, 3 * MINUTE), "Cycle des cotes d'or détecté", `Cycle médian ${(gold.medGap / MINUTE).toFixed(1)} min — dernier ${(elapsed / MINUTE).toFixed(1)} min — MAD ${(gold.madGap / MINUTE).toFixed(2)}min`, 'gold-cycle', Infinity, 66);
      }
    }
    if (low15) {
      const score = Math.round(clamp(70 + Math.min(15, (now - ordered[14].timestamp) / MINUTE), 65, 92));
      return result(clamp(geo * 2.5 + med, 2.5, 15), score, now + 90000, 2 * MINUTE, 'Série basse — rebond statistique', `15 tours <2x — moy géo ${geo.toFixed(2)}x, médiane ${med.toFixed(2)}x`, 'low-streak', 82, -Infinity);
    }
    if (high30.length >= 3) {
      const groupGeo = geometric(high30.map(row => row.coefficient)), divisor = high30.length >= 5 ? 3 : high30.length >= 4 ? 4 : 5;
      return result(clamp(groupGeo / divisor, 2, 12), Math.min(78, 60 + high30.length * 3), now + 2 * MINUTE, 2.5 * MINUTE, `${high30.length} cotes ≥20x récentes`, `Moy. géo grosses cotes ${groupGeo.toFixed(2)}x ÷ ${divisor}`, 'high-cluster', 72, -Infinity);
    }
    const last60 = ordered.slice(0, 60), middleRounds = last60.filter(row => row.coefficient >= 5 && row.coefficient < 10);
    const lowShare = last60.length ? last60.filter(row => row.coefficient < 2).length / last60.length : 0;
    if (middleRounds.length >= 3) {
      const groupGeo = geometric(middleRounds.map(row => row.coefficient)), fragile = lowShare > .55 || deviation > avg50 * 1.4;
      const target = fragile ? clamp(groupGeo * .45, 2, 4.5) : clamp(groupGeo * .7, 3, 7);
      const score = Math.round(clamp(64 + middleRounds.length * 4 + (fragile ? -6 : 6), 58, 90));
      return result(target, score, now + 2 * MINUTE, 2.5 * MINUTE, fragile ? `Phase mixte — ${middleRounds.length} cotes 5x-9x sur base fragile` : `Phase favorable — ${middleRounds.length} cotes 5x-9x récentes`, `Zone 5x-9x géo ${groupGeo.toFixed(2)}x — <2x: ${(lowShare * 100).toFixed(0)}% — σ50 ${deviation.toFixed(2)}`, fragile ? 'mid-fragile' : 'mid-favorable', 82, 68);
    }
    const hourRatio = hour && hour.count >= 5 ? hour.avg / Math.max(geo, .1) : 1, minuteRatio = minute && minute.count >= 5 ? minute.avg / Math.max(geo, .1) : 1;
    const weighted = ema20 * .5 + ema50 * .3 + avg50 * .2;
    let target = clamp(weighted * hourRatio * .6 + (minute?.max ?? 0) * .1 + 1.6, 1.8, 12);
    const fragile = lowShare > .6 || deviation > avg50 * 1.6;
    if (fragile) target = Math.min(target, 3.2); else if (lowShare > .45) target = Math.min(target, 5);
    const score = Math.round(clamp(52 + clamp(rounds.length / 25, 0, 28) + clamp(Math.abs(hourRatio - 1) * 42, 0, 22) + clamp(Math.abs(minuteRatio - 1) * 32, 0, 16) + (absolute > 0 && absolute < avg50 * .6 ? 5 : 0) + (fragile ? -8 : 0), 50, 92));
    const delay = 2 * MINUTE + (60 - clock.second) * 1000 % 45000;
    return result(target, score, now + delay, 2.5 * MINUTE, hourRatio > 1.1 ? 'Plage horaire favorable' : hourRatio < .9 ? 'Plage horaire faible' : 'Analyse multi-signaux', `EMA20 ${ema20.toFixed(2)}x — H${clock.hour}h: géo ${hour?.avg.toFixed(2) ?? '—'}x (${hour?.count ?? 0}) — MAD ${absolute.toFixed(2)} — σ ${deviation.toFixed(2)} — ${rounds.length} tours`, 'multi');
  }
  function timestamp(value) {
    if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) { const n = Number(value); return n > 1e12 ? n : n * 1000; }
    if (typeof value !== 'string') return NaN;
    let text = value.trim();
    if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(text)) text = text.replace(' ', 'T') + 'Z';
    return Date.parse(text);
  }
  function normalizeRows(payload, {requireId = false, allowUntimed = false} = {}) {
    let array = Array.isArray(payload) ? payload : payload?.rounds ?? payload?.data?.rounds ?? payload?.data ?? payload?.items ?? payload?.history ?? payload?.results;
    if (!Array.isArray(array)) throw Error('В JSON нужен массив rounds, data, history либо массив раундов.');
    if (!array.length) throw Error('Источник вернул пустую историю.');
    let skipped = 0;
    const rows = [];
    for (const raw of array) {
      if (!raw || typeof raw !== 'object') { skipped++; continue; }
      const number = raw.coefficient ?? raw.multiplier ?? raw.topCoefficient ?? raw.coef ?? raw.crash ?? raw.value ?? raw.finalValues?.[0];
      const coefficient = Number(String(number).replace(/x$/i, '').replace(',', '.'));
      const time = timestamp(raw.at ?? raw.round_timestamp ?? raw.played_at ?? raw.timestamp ?? raw.created_at ?? raw.finished_at ?? raw.createdAt ?? raw.startedAt ?? raw.finishedAt ?? raw.endedAt ?? raw.startTime ?? raw.endTime ?? raw.time ?? raw.date);
      const originalId = raw.round_id ?? raw.id ?? raw.roundId ?? raw.gameId ?? raw.round ?? raw._id;
      if (!Number.isFinite(coefficient) || coefficient < 1 || ((!Number.isFinite(time) || time <= 0) && !allowUntimed) || ((requireId || !Number.isFinite(time)) && originalId == null)) { skipped++; continue; }
      const knownTime = Number.isFinite(time) && time > 0;
      rows.push({id: String(originalId ?? `import:${time}:${coefficient}`), coefficient, timestamp: knownTime ? time : null, estimated: !knownTime || raw.estimated === true || raw.estimated === 'true', order: Number(raw.feed_order ?? raw.source_seq ?? raw.order ?? 0), timeKind: knownTime ? (raw.timeKind === 'observed' ? 'observed' : 'source') : 'unknown', observedSince: Number.isFinite(raw.observedSince) ? raw.observedSince : null, gateway: raw.gateway === true});
    }
    if (!rows.length) throw Error('Нет раундов с корректными коэффициентом и временем. Для анализа нужны оба поля.');
    return {rows: mergeRows([], rows), skipped};
  }
  function mergeRows(existing, incoming, limit = 2000) {
    const map = new Map(existing.map(row => [row.id, row]));
    for (const row of incoming) {
      const prior = map.get(row.id);
      if (prior && prior.coefficient !== row.coefficient) throw Error(`Разные коэффициенты для одного ID ${row.id.slice(0, 40)}. Обновление остановлено.`);
      map.set(row.id, row);
    }
    return [...map.values()].sort((a, b) => a.gateway && b.gateway ? b.order - a.order : (b.timestamp ?? 0) - (a.timestamp ?? 0) || b.order - a.order).slice(0, limit);
  }
  function normalizeGateway(payload, existing = [], now = Date.now(), previousPollAt = 0) {
    const raw = Array.isArray(payload) ? payload : payload?.data ?? payload?.items ?? payload?.history ?? payload?.rounds;
    if (!Array.isArray(raw)) throw Error('Gateway вернул неподдерживаемый формат истории.');
    const completed = raw.filter(row => row && typeof row === 'object' && (!row.state || ['ending', 'ended', 'finished', 'completed', 'crashed'].includes(String(row.state).toLowerCase())));
    const incoming = normalizeRows(completed, {requireId: true, allowUntimed: true});
    const prior = new Map(existing.map(row => [row.id, row]));
    const inputOrder = completed.map(row => String(row.round_id ?? row.id ?? row.roundId ?? row.gameId ?? row.round ?? row._id));
    incoming.rows.sort((a, b) => inputOrder.indexOf(a.id) - inputOrder.indexOf(b.id));
    const newcomers = incoming.rows.filter(row => !prior.has(row.id)).length;
    let nextOrder = maximum(existing.map(row => row.order || 0)) + newcomers;
    const oldHead = existing[0]?.id, changed = !!oldHead && incoming.rows[0]?.id !== oldHead;
    const shortObservation = changed && previousPollAt > 0 && now > previousPollAt && now - previousPollAt <= 15000;
    incoming.rows = incoming.rows.map((row, index) => {
      const before = prior.get(row.id);
      if (before && before.coefficient !== row.coefficient) throw Error('Gateway изменил коэффициент существующего ID. Обновление остановлено.');
      const order = before?.order || nextOrder--;
      if (!Number.isFinite(row.timestamp) && Number.isFinite(before?.timestamp)) return {...before, gateway: true, order};
      if (!Number.isFinite(row.timestamp) && index === 0 && !before && shortObservation) return {...row, timestamp: now, estimated: true, timeKind: 'observed', observedSince: previousPollAt, gateway: true, order};
      return {...row, gateway: true, order};
    });
    return incoming;
  }
  function csvRows(text) {
    const first = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '', delimiter = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
    const result = []; let row = [], cell = '', quoted = false;
    const input = text.replace(/^\uFEFF/, '') + '\n';
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === '"') { if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && input[i + 1] === '\n') i++; row.push(cell); if (row.some(v => v.trim())) result.push(row); row = []; cell = ''; }
      else cell += char;
    }
    if (quoted) throw Error('Незакрытые кавычки в CSV.');
    const headers = result.shift()?.map(value => value.trim().toLowerCase());
    if (!headers?.length || !result.length) throw Error('CSV должен содержать заголовок и раунды.');
    return result.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim() ?? ''])));
  }
  function evaluateEntry(entry, rows, now = Date.now()) {
    if (entry.status === 'hit') return entry;
    const hit = rows.filter(row => {
      const boundedObservation = row.timeKind === 'observed' && Number.isFinite(row.observedSince) && row.observedSince > entry.createdAt && row.observedSince >= entry.start && row.timestamp - row.observedSince <= 15000;
      return (!row.estimated || boundedObservation) && Number.isFinite(row.timestamp) && row.timestamp <= now && row.timestamp > entry.createdAt && row.timestamp >= entry.start && row.timestamp <= entry.end && row.coefficient >= entry.target;
    }).sort((a, b) => a.timestamp - b.timestamp)[0];
    if (hit) return {...entry, status: 'hit', roundId: hit.id, result: hit.coefficient, resultAt: hit.timestamp};
    if (now > entry.end) return {...entry, status: 'unknown'};
    return entry;
  }
  root.LuckyJetCore = Object.freeze({MINUTE, clamp, mean, median, sigma, mad, geometric, maximum, ema, clockParts, gapStats, buckets, predict, bigOpportunity, De: predict, Ce: bigOpportunity, timestamp, normalizeRows, normalizeGateway, mergeRows, csvRows, evaluateEntry});
})(typeof window === 'undefined' ? globalThis : window);
