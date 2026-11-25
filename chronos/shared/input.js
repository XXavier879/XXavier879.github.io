// input.js -- engine input layer, SMARTBOARD edition: NO joystick, NO on-screen action buttons.
//   * keyboard still works (arrows/WASD + Z/X/C) -> keys / inputState, read by engine.js keyboardInput()
//   * pointer (finger / pen / mouse / smartboard) -> Pointer.on(fn), fn({type:'down'|'move'|'up', x, y, id, pointerType})
//     x,y are client (CSS px) coordinates. Only ONE pointer is "active" at a time (the latest finger down),
//     so extra palms / second fingers on a big board can't fight each other.
const keys = {};
const inputState = { up: false, down: false, left: false, right: false, z: false, x: false, c: false };
document.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
});
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

const Pointer = {
  _l: [],
  down: false,
  id: null,
  on(fn) { this._l.push(fn); },
  _emit(type, e) {
    const ev = { type, x: e.clientX, y: e.clientY, id: e.pointerId, pointerType: e.pointerType };
    for (const f of this._l) f(ev);
  },
};
(function () {
  const el = document.getElementById('native-ui');
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    Pointer.down = true; Pointer.id = e.pointerId; // latest contact wins
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    Pointer._emit('down', e);
  });
  el.addEventListener('pointermove', e => {
    if (!Pointer.down || e.pointerId !== Pointer.id) return;
    e.preventDefault();
    Pointer._emit('move', e);
  });
  const end = e => {
    if (e.pointerId !== Pointer.id) return;
    Pointer.down = false; Pointer.id = null;
    Pointer._emit('up', e);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  for (const t of ['contextmenu', 'dragstart', 'selectstart']) document.addEventListener(t, e => e.preventDefault());
  for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault());
})();
