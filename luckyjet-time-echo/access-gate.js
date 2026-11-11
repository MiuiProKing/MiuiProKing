/* Visual access gate for TIME ECHO. This is a client-side lock, not server authorization. */
(() => {
  'use strict';
  const KEY = 'god_time_echo_1993_unlocked_v1';
  const already = (() => { try { return sessionStorage.getItem(KEY) === 'yes'; } catch { return false; } })();
  if (already) { document.documentElement.classList.add('god-gate-open'); return; }
  document.documentElement.classList.add('god-gate-locked');
  function mount() {
    if (document.getElementById('godAccessGate')) return;
    const gate = document.createElement('div');
    gate.id = 'godAccessGate';
    gate.setAttribute('role','dialog');
    gate.setAttribute('aria-modal','true');
    gate.setAttribute('aria-labelledby','godGateTitle');
    gate.innerHTML = '<form id="godGateForm" autocomplete="off"><div class="god-gate-symbol" aria-hidden="true">✦</div><div class="god-gate-overline">GOD PREDITOR · PRIVATE ACCESS</div><h2 id="godGateTitle">Доступ к TIME ECHO</h2><p>Введите пароль для входа</p><label for="godGatePassword">Пароль</label><div class="god-gate-input-row"><input id="godGatePassword" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="24" autocomplete="off" placeholder="••••" required><button type="button" id="godGateToggle" aria-label="Показать пароль">◉</button></div><div class="god-gate-error" id="godGateError" role="status" aria-live="polite"></div><button class="god-gate-submit" type="submit">ВОЙТИ <span aria-hidden="true">→</span></button><div class="god-gate-footer">LUCKYJET · AMOLED ULTRA VIVID</div></form>';
    document.body.append(gate);
    const input = document.getElementById('godGatePassword');
    const error = document.getElementById('godGateError');
    document.getElementById('godGateToggle').addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      input.focus();
    });
    document.getElementById('godGateForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (input.value === '1993') {
        try { sessionStorage.setItem(KEY, 'yes'); } catch {}
        document.documentElement.classList.remove('god-gate-locked');
        document.documentElement.classList.add('god-gate-open');
        gate.remove();
        return;
      }
      input.value = '';
      error.textContent = 'Неверный пароль. Попробуйте ещё раз.';
      input.focus();
    });
    input.focus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();