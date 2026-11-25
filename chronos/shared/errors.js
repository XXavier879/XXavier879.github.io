// errors.js -- engine: critical error handler. Load FIRST (before input.js) so it catches everything.
// On an uncaught error / unhandled promise rejection it:
//   1. plays sfx/snd_error.wav through the shared GameAudio instance (falls back to a plain <audio> if GameAudio itself is broken)
//   2. shows an overlay with the error + the latest console logs (log / info / warn / error / debug)
// The same error is only shown/played once (repeats just bump a counter), so a crash inside the
// game loop doesn't spam the speaker every frame.
// API: CriticalError.report(err, source)  CriticalError.logs()  CriticalError.show()  CriticalError.hide()
//      CriticalError.cfg.maxLogs / .shownLogs / .sound

const CriticalError = (() => {
  const cfg = { maxLogs: 300, shownLogs: 40, sound: 'snd_error', soundUrl: 'sfx/snd_error.wav', volume: 1 };
  const logs = [];
  const seen = new Map();          // signature -> count
  let current = null;              // { title, detail, sig }
  let root = null, hidden = false;

  // ---------- log capture ----------
  const fmt = a => {
    if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  };
  ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        logs.push({ t: new Date(), level, text: args.map(fmt).join(' ') });
        if (logs.length > cfg.maxLogs) logs.shift();
        if (root && !hidden) render();   // keep the overlay's log list live
      } catch (e) {}
      orig(...args);
    };
  });

  // ---------- sound ----------
  function fallbackSound() {
    try { const a = new Audio(cfg.soundUrl); a.volume = cfg.volume; a.play().catch(() => {}); } catch (e) {}
  }
  function playSound() {
    try {
      const p = GameAudio.playSFX(cfg.sound, cfg.volume);
      if (p && p.catch) p.catch(fallbackSound);
    } catch (e) { fallbackSound(); }
  }

  // ---------- overlay ----------
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const COLORS = { error: '#ff6b6b', warn: '#ffd166', info: '#7dd3fc', debug: '#a3a3a3', log: '#e5e5e5' };

  function build() {
    root = document.createElement('div');
    root.id = 'critical-error';
    root.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.93);color:#fff;font:12px/1.4 monospace;' +
      'padding:12px;box-sizing:border-box;overflow:auto;touch-action:pan-y;user-select:text;-webkit-user-select:text;';
    // keep the game's document-level touch handlers (joystick etc.) from swallowing taps on the overlay
    ['touchstart', 'touchmove'].forEach(ev => root.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'close') hide();
      else if (b.dataset.act === 'copy') copy(b);
    });
    document.body.appendChild(root);
  }

  function copy(btn) {
    const text = report_text();
    const done = () => { btn.textContent = 'COPIED'; setTimeout(() => { btn.textContent = 'COPY'; }, 1200); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => {});
    else done();
  }
  function report_text() {
    return `${current ? current.title + '\n' + current.detail : ''}\n\n--- latest logs ---\n` +
      logs.slice(-cfg.shownLogs).map(l => `[${l.t.toLocaleTimeString()}] ${l.level.toUpperCase()} ${l.text}`).join('\n');
  }

  function render() {
    if (!root) build();
    const btn = 'style="background:#222;color:#fff;border:1px solid #888;padding:8px 14px;margin-right:8px;font:inherit;cursor:pointer;"';
    const count = current ? seen.get(current.sig) : 0;
    const lines = logs.slice(-cfg.shownLogs).map(l =>
      `<div style="color:${COLORS[l.level] || '#fff'};white-space:pre-wrap;word-break:break-word;border-bottom:1px solid #222;padding:2px 0;">` +
      `<span style="opacity:.5">${l.t.toLocaleTimeString()}</span> ${esc(l.level.toUpperCase())} ${esc(l.text)}</div>`).join('');
    root.innerHTML =
      `<div style="font-size:16px;color:#ff6b6b;font-weight:bold;margin-bottom:6px;">CRITICAL ERROR${count > 1 ? ` (x${count})` : ''}</div>` +
      `<div style="margin-bottom:8px;"><button ${btn} data-act="close">DISMISS</button><button ${btn} data-act="copy">COPY</button></div>` +
      (current ? `<div style="color:#fff;font-weight:bold;white-space:pre-wrap;word-break:break-word;">${esc(current.title)}</div>` +
        `<div style="color:#ffb4b4;white-space:pre-wrap;word-break:break-word;margin:4px 0 12px;">${esc(current.detail)}</div>` : '') +
      `<div style="color:#aaa;margin-bottom:4px;">Latest logs (${Math.min(logs.length, cfg.shownLogs)}):</div>${lines}`;
    const wasAtBottom = true; if (wasAtBottom) root.scrollTop = 0;
  }

  function show() {
    hidden = false;
    const go = () => { render(); root.style.display = 'block'; };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, { once: true });
  }
  function hide() { hidden = true; if (root) root.style.display = 'none'; }

  // ---------- reporting ----------
  function report(err, source = 'error') {
    const isErr = err instanceof Error;
    const title = isErr ? `${err.name}: ${err.message}` : String(err?.message ?? err);
    const detail = (isErr && err.stack ? err.stack : '') + (source ? `\n[${source}]` : '');
    const sig = title + '|' + (isErr && err.stack ? err.stack.split('\n')[1] || '' : source);
    const n = (seen.get(sig) || 0) + 1;
    seen.set(sig, n);
    logs.push({ t: new Date(), level: 'error', text: `CRITICAL: ${title}` });
    if (n > 1) { if (current && current.sig === sig && root && !hidden) render(); return; }   // already shown + played once
    current = { title, detail: detail.trim(), sig };
    playSound();
    show();
  }

  window.addEventListener('error', e => {
    if (e.target && e.target !== window) return; // resource load failures (img/audio) are not critical
    const err = e.error instanceof Error ? e.error : new Error(`${e.message} (${e.filename || '?'}:${e.lineno || 0}:${e.colno || 0})`);
    report(err, 'uncaught');
  });
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    report(r instanceof Error ? r : new Error(`Unhandled promise rejection: ${fmt(r)}`), 'promise');
  });

  return { cfg, report, show, hide, logs: () => logs.slice() };
})();
