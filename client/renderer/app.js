'use strict';

/*
 * Renderer UI — vanilla JS. No Node APIs here (nodeIntegration is off);
 * everything goes through the window.lab preload bridge:
 *   window.lab.api(...)   -> ipcRenderer.invoke('lab:api')  -> main -> HTTP + RC4
 *   window.lab.readFile() -> ipcRenderer.invoke('lab:read-file') -> main (V4 sink)
 */
(function () {
  const $ = (id) => document.getElementById(id);

  function setStatus(msg, isError) {
    const bar = $('status-bar');
    bar.textContent = msg;
    bar.classList.toggle('error', Boolean(isError));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderTable(container, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = '<div class="hint">(no rows)</div>';
      return;
    }
    const cols = Array.from(rows.reduce((set, r) => {
      Object.keys(r || {}).forEach((k) => set.add(k));
      return set;
    }, new Set()));
    const head = cols.map((c) => '<th>' + esc(c) + '</th>').join('');
    const body = rows.map((r) =>
      '<tr>' + cols.map((c) => '<td>' + esc(r[c] === null || r[c] === undefined ? '' : r[c]) + '</td>').join('') + '</tr>'
    ).join('');
    container.innerHTML = '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderJson(container, obj) {
    container.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  }

  const FRIENDLY_ERRORS = {
    invalid_credentials: 'invalid username or password',
    auth_required: 'not logged in',
    forbidden: 'not permitted for your role'
  };

  function friendlyHttp(errMsg) {
    const m = /HTTP (\d{3})\s*(\{[\s\S]*\})/.exec(String(errMsg));
    if (!m) return String(errMsg);
    let body = null;
    try { body = JSON.parse(m[2]); } catch { /* fall through */ }
    const msg = body ? (body.message || FRIENDLY_ERRORS[body.error] || body.error) : 'request failed';
    return msg + ' (HTTP ' + m[1] + ')';
  }

  function renderError(container, action, res) {
    const msg = (res.body && (res.body.message || FRIENDLY_ERRORS[res.body.error] || res.body.error)) || JSON.stringify(res.body);
    container.innerHTML = '<div class="error-note">' + esc(action + ' failed: ' + msg + ' (HTTP ' + res.status + ')') + '</div>';
  }

  // Bumped on every logout; guard() captures it per click so responses that
  // resolve after a logout (previous user's in-flight requests) are dropped
  // instead of rendering into the new session's view.
  let sessionEpoch = 0;

  async function guard(fn, label) {
    const epoch = sessionEpoch;
    try {
      await fn(() => epoch !== sessionEpoch);
    } catch (err) {
      if (epoch !== sessionEpoch) return;
      setStatus((label ? label + ' failed: ' : 'Error: ') + friendlyHttp(err.message), true);
    }
  }

  async function refreshLoginState() {
    const state = await window.lab.loginState();
    applyView(state);
    if (state.user) {
      setStatus('Connected · logged in as ' + state.user.username + ' (' + state.user.role + ')');
    } else {
      setStatus('Connected · not logged in');
    }
  }

  function applyView(state) {
    const user = state && state.user;
    $('app').hidden = !user;
    $('login-form').hidden = Boolean(user);
    $('login-hint').hidden = Boolean(user);
    $('session-bar').hidden = !user;
    $('auth-heading').textContent = user ? 'Account' : 'Login';
    if (user) {
      $('session-label').textContent = 'Signed in as ' + user.username + ' (' + user.role + ')';
    }
  }

  function toIso(value) {
    return value ? new Date(value).toISOString() : undefined;
  }

  function num(id) {
    const v = $(id).value.trim();
    return v === '' ? undefined : Number(v);
  }

  $('btn-login').addEventListener('click', () => guard(async (stale) => {
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    $('login-password').value = '';
    const res = await window.lab.login(username, password);
    if (stale()) return;
    applyView({ user: res.user });
    setStatus('Logged in as ' + res.user.username + ' (' + res.user.role + ')');
  }, 'Login'));

  $('btn-logout').addEventListener('click', () => guard(async () => {
    sessionEpoch += 1;
    await window.lab.logout();
    applyView({ user: null });
    document.querySelectorAll('.out').forEach((el) => { el.textContent = ''; });
    $('login-username').value = '';
    $('login-password').value = '';
    setStatus('Logged out');
  }));

  $('btn-equip-list').addEventListener('click', () => guard(async (stale) => {
    const status = $('equip-status').value;
    const res = await window.lab.api('/api/equipment/list', status ? { status } : {});
    if (stale()) return;
    renderTable($('equip-out'), res.status === 200 ? res.body : [res.body]);
  }));

  $('btn-res-search').addEventListener('click', () => guard(async (stale) => {
    const res = await window.lab.api('/api/reservations/search', { q: $('res-search-q').value });
    if (stale()) return;
    renderTable($('res-out'), res.status === 200 ? res.body : [res.body]);
  }));

  $('btn-res-list').addEventListener('click', () => guard(async (stale) => {
    const res = await window.lab.api('/api/reservations/list', {});
    if (stale()) return;
    renderTable($('res-out'), res.status === 200 ? res.body : [res.body]);
  }));

  $('btn-res-create').addEventListener('click', () => guard(async (stale) => {
    const btn = $('btn-res-create');
    btn.disabled = true;
    try {
      const res = await window.lab.api('/api/reservations/create', {
        equipmentId: num('res-create-equipment'),
        startsAt: toIso($('res-create-starts').value),
        endsAt: toIso($('res-create-ends').value),
        purpose: $('res-create-purpose').value || undefined
      });
      if (stale()) return;
      if (res.status === 200 || res.status === 201) {
        setStatus('Reservation created (id ' + res.body.id + ')');
        ['res-create-equipment', 'res-create-starts', 'res-create-ends', 'res-create-purpose']
          .forEach((id) => { $(id).value = ''; });
      } else {
        renderError($('res-out'), 'Create reservation', res);
      }
    } finally {
      btn.disabled = false;
    }
  }));

  $('btn-res-update').addEventListener('click', () => guard(async (stale) => {
    const payload = { id: num('res-update-id') };
    const status = $('res-update-status').value;
    if (status) payload.status = status;
    const res = await window.lab.api('/api/reservations/update', payload);
    if (stale()) return;
    if (res.status === 200) {
      setStatus('Reservation updated');
    } else {
      renderError($('res-out'), 'Update reservation', res);
    }
  }));

  $('btn-fault-list').addEventListener('click', () => guard(async (stale) => {
    const res = await window.lab.api('/api/fault-reports/list', {});
    if (stale()) return;
    renderTable($('fault-out'), res.status === 200 ? res.body : [res.body]);
  }));

  $('btn-fault-create').addEventListener('click', () => guard(async (stale) => {
    const btn = $('btn-fault-create');
    btn.disabled = true;
    try {
      const res = await window.lab.api('/api/fault-reports/create', {
        equipmentId: num('fault-equipment'),
        title: $('fault-title').value,
        severity: $('fault-severity').value || undefined,
        description: $('fault-description').value || undefined
      });
      if (stale()) return;
      if (res.status === 200 || res.status === 201) {
        setStatus('Fault report submitted (id ' + res.body.id + ')');
        ['fault-equipment', 'fault-title', 'fault-severity', 'fault-description']
          .forEach((id) => { $(id).value = ''; });
      } else {
        renderError($('fault-out'), 'Submit report', res);
      }
    } finally {
      btn.disabled = false;
    }
  }));

  $('btn-diag-run').addEventListener('click', () => guard(async (stale) => {
    const res = await window.lab.api('/api/diagnostics/run', { equipmentId: num('diag-run-equipment') });
    if (stale()) return;
    renderJson($('diag-out'), res.status === 200 ? res.body : res.body);
  }));

  $('btn-diag-fetch').addEventListener('click', () => guard(async (stale) => {
    const res = await window.lab.api('/api/diagnostics/fetch', {
      equipmentId: num('diag-fetch-equipment'),
      target: $('diag-fetch-target').value.trim()
    });
    if (stale()) return;
    renderJson($('diag-out'), res.status === 200 ? res.body : res.body);
  }));

  $('btn-sweep').addEventListener('click', () => guard(async (stale) => {
    const cfg = await window.lab.appConfig();
    const fs = cfg.fieldService;
    const res = await window.lab.api(fs.endpoint, {}, { [fs.header]: fs.token });
    if (stale()) return;
    if (res.status !== 200) {
      $('sweep-out').innerHTML = '';
      setStatus('Fleet sweep failed: ' + res.status + ' ' + JSON.stringify(res.body), true);
      return;
    }
    renderJson($('sweep-out'),
      'Fleet sweep completed.\n' +
      'fleet rows: ' + res.body.fleet.length + ' · run-history rows: ' + res.body.recentRuns.length + '\n\n' +
      JSON.stringify(res.body, null, 2));
  }));

  $('btn-v4-read').addEventListener('click', () => guard(async (stale) => {
    const requested = $('v4-path').value.trim();
    const text = await window.lab.readFile(requested);
    if (stale()) return;
    renderJson($('v4-out'), text);
  }));

  refreshLoginState().catch((err) => setStatus('Error: ' + err.message, true));
})();
