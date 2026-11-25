// engine.js -- generic 2D tile/room engine. Knows NOTHING about a specific game:
// no party, stats, menus, battles or demo content. Load order:
//   input.js -> engine.js -> state.js -> (game files)
// Game hooks: setPlayer(), setDialogSkin(), addRoom(), startEngine(), GameState.register(),
// pushOverlay(), inputEvents.on(), Engine.config.
const Engine = { config: { spritePath: 'sprites/', viewHeight: 576, viewWidthPortrait: 480 }, onCamera: null };
const dynamicKeyMappings = {};
const inputLocks = {};
let wasDialogActiveLastFrame = false;
let isTransitioning = false;
let transitionAlpha = 0;
let settingsActive = false;
function toggleSettings(forceState) {
  const menu = document.getElementById('settings-menu');
  if (!menu) return; // Failsafe if HTML isn't set up yet
  settingsActive = forceState !== undefined ? forceState : !settingsActive;
  menu.style.display = settingsActive ? 'block' : 'none';
  if (settingsActive) GameState.openUI('settings'); else GameState.closeUI('settings');
}
class AudioManager {
  constructor() {
    this.ctx = null;
    this.sounds = {};
    this.bgmNode = null;
    this.isInitialized = false;

    // Master volume controls
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;
  }

  // Must be called explicitly from a user gesture (click, tap, keypress)
  async init() {
    if (this.isInitialized) return true;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.masterGain);

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.isInitialized = true;
      console.log("AudioManager: Successfully initialized.");
      return true;
    } catch (e) {
      console.error("AudioManager: Initialization failed", e);
      return false;
    }
  }

  async preload(id, url) {
    if (this.sounds[id]) return this.sounds[id];

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch audio: ${res.statusText}`);
      const arrayBuffer = await res.arrayBuffer();

      // Ensure AudioContext exists (lazy-create if preloading before explicit init)
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
      }

      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.sounds[id] = audioBuffer;
      return audioBuffer;
    } catch (e) {
      console.error(`AudioManager: Error loading sound "${id}" from ${url}`, e);
      return null;
    }
  }

  async playSFX(id, volume = 1.0, pitch = 1.0) {
    if (!this.isInitialized) {
      const success = await this.init();
      if (!success) return;
    }

    let buffer = this.sounds[id];
    if (!buffer) {
      const url = (id.includes('/') || id.includes('.')) ? id : `./sfx/${id}.wav`;
      buffer = await this.preload(id, url);
      if (!buffer) return;
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.sfxGain || this.ctx.destination);
    
    source.start(0);

    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };

    return source;
  }

  async playBGM(id, volume = 0.5) {
    if (!this.isInitialized) {
      const success = await this.init();
      if (!success) return;
    }

    let buffer = this.sounds[id];
    if (!buffer) {
      buffer = await this.preload(id, id);
      if (!buffer) return;
    }

    this.stopBGM();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    this.bgmGain.gain.setValueAtTime(volume, this.ctx.currentTime);
    source.connect(this.bgmGain || this.ctx.destination);
    source.start(0);
    this.bgmNode = source;
  }

  stopBGM() {
    if (!this.bgmNode) return;
    try {
      this.bgmNode.stop();
      this.bgmNode.disconnect();
    } catch (e) {}
    this.bgmNode = null;
  }
}

// Global Instance
const GameAudio = new AudioManager();
window.GameAudio = GameAudio; // top-level const isn't on window; game code checks window.GameAudio
// fire-and-forget SFX helper (never throws / never leaves an unhandled rejection)
function sfx(id, volume = 1, pitch = 1) {
  try { Promise.resolve(GameAudio.playSFX(id, volume, pitch)).catch(() => {}); } catch (e) {}
}
// (sfx preload removed: the game synthesizes its sounds, see game.js)

class EventDispatcher {
  constructor() { this.listeners = {}; }
  on(event, cb) { (this.listeners[event] ??= []).push(cb); return () => this.off(event, cb); }
  off(event, cb) { this.listeners[event] = (this.listeners[event] || []).filter(fn => fn !== cb); }
  emit(event, data) { (this.listeners[event] || []).forEach(cb => cb(data)); }
}
const inputEvents = new EventDispatcher();
let prevRaw = {};
function dispatchInputEvents(raw) {
  for (const key in raw) {
    const was = !!prevRaw[key], is = !!raw[key];
    if (is && !was) inputEvents.emit(`press:${key}`);
    if (!is && was) inputEvents.emit(`release:${key}`);
  }
  prevRaw = { ...raw };
}
const overlayStack = [];
// Overlays only open in the states listed in o.allowedStates (default: normal only),
// so the C-menu can't open during battle / none. Returns false if refused.
function pushOverlay(o) {
  const allowed = o.allowedStates ?? ['normal'];
  if (!GameState.uiOpen && !allowed.includes(GameState.base)) return false;
  overlayStack.push(o);
  if (o.blocksWorld !== false) GameState.openUI(o);
  o.onOpen?.();
  return true;
}
function popOverlay() { const o = overlayStack.pop(); if (o) GameState.closeUI(o); o?.onClose?.(); return o; }
function currentOverlay() { return overlayStack.at(-1) ?? null; }
function updateOverlays() { for (const o of overlayStack) o.update?.(); }
function renderOverlays() { for (const o of overlayStack) o.draw?.(); }
function overlaysBlockWorld() { return overlayStack.some(o => o.blocksWorld !== false); }
let lastRawInput = {};
const MOVE_KEYS = ['up', 'down', 'left', 'right'];
// Called on state changes: held action buttons must be released before they count again.
function lockHeldInputs() {
  for (const k in lastRawInput) if (lastRawInput[k] && !MOVE_KEYS.includes(k)) inputLocks[k] = true;
}
function keyboardInput() {
  const raw = {
    up: keys["w"] || keys["arrowup"] || inputState.up,
    down: keys["s"] || keys["arrowdown"] || inputState.down,
    left: keys["a"] || keys["arrowleft"] || inputState.left,
    right: keys["d"] || keys["arrowright"] || inputState.right,
    run: keys["x"] || inputState.x,
    interact: keys["z"] || inputState.z,
    menu: keys["c"] || inputState.c,
    dash: keys["shift"] || inputState.dash // Dash explicitly tracked for emote mapping
  };

  for (const [keyId, pcKeyArr] of Object.entries(dynamicKeyMappings)) {
    raw[keyId] = inputState[keyId] || pcKeyArr.some(k => keys[k.toLowerCase()]);
  }
  dispatchInputEvents(raw);
  lastRawInput = raw;
  if (dialogActive || isTransitioning || settingsActive || overlaysBlockWorld()) {
    for (let k in inputLocks) inputLocks[k] = false;
  }
  if (wasDialogActiveLastFrame && !dialogActive) {
    for (let k in raw) { if (raw[k]) inputLocks[k] = true; }
  }
  for (let k in raw) {
    if (!raw[k]) inputLocks[k] = false;
  }
  wasDialogActiveLastFrame = dialogActive;
  const filtered = {};
  for (let k in raw) {
    filtered[k] = raw[k] && !inputLocks[k] && !isTransitioning && !settingsActive && !overlaysBlockWorld();
  }
  return filtered;
}
function addDynamicButton(id, label, pcKeysArr) {
  dynamicKeyMappings[id] = pcKeysArr.map(k => k.toLowerCase());
  inputState[id] = false;
  const btn = document.createElement('div');
  btn.className = 'action-btn';
  btn.id = 'btn-' + id;
  btn.dataset.key = id;
  btn.textContent = label;
  const existingDynamicCount = Object.keys(dynamicKeyMappings).length - 1;
  const rightOffset = 145 + (existingDynamicCount * 65);
  btn.style.bottom = '40px';
  btn.style.right = rightOffset + 'px';
  document.getElementById('buttons-wrapper').appendChild(btn);
}
let cameraTarget = {x:0, y:0, cullW:0, cullH:0};
const DEBUG = false;
const measure_unit = 24;
let _lastFrameTime = performance.now();
let dt = 1000 / 60;
let dtScale = 1;
function updateFrameTiming() {
  const now = performance.now();
  let delta = now - _lastFrameTime;
  _lastFrameTime = now;
  dt = Math.min(delta, 100);
  dtScale = dt / (1000 / 60);
}
const SPRITE_SCALE = 1;
let canvas = document.getElementById("game");
let ctxbx = canvas.getContext("2d");
ctxbx.imageSmoothingEnabled = false;
let BASE_W = 960, BASE_H = 540; // logical view size, recomputed from the window in resizeCanvases()
let nativeCanvas = document.getElementById("native-ui");
let nctx = nativeCanvas.getContext("2d");
nctx.imageSmoothingEnabled = false;
let nativeScale = 1;
let NATIVE_RES = 1, MAIN_RES = 1; // backing-store multipliers (auto: keeps big screens crisp)
function resizeCanvases() {
  // The view fills the WHOLE window (smartboards, phones, anything). Logical height is fixed
  // (Engine.config.viewHeight) so world pixels keep the same size; width follows the aspect ratio.
  const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
  const aspect = vw / vh;
  let w, h;
  if (aspect >= 1) { h = Engine.config.viewHeight; w = h * aspect; }
  else { w = Engine.config.viewWidthPortrait; h = w / aspect; }
  BASE_W = Math.round(w / 2) * 2; BASE_H = Math.round(h / 2) * 2;
  const phys = (vw * (window.devicePixelRatio || 1)) / BASE_W;
  MAIN_RES = NATIVE_RES = Math.max(1, Math.min(3, Math.ceil(phys - 0.15)));
  for (const c of [canvas, nativeCanvas]) {
    c.style.width = vw + 'px'; c.style.height = vh + 'px';
    c.style.left = '0px'; c.style.top = '0px';
    c.width = BASE_W * MAIN_RES; c.height = BASE_H * MAIN_RES;
  }
  ctxbx.imageSmoothingEnabled = false;
  nctx.imageSmoothingEnabled = false;
  nativeScale = NATIVE_RES;
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();
function clearNativeCanvas() {
  nctx.save();
  nctx.setTransform(1, 0, 0, 1, 0, 0);
  nctx.clearRect(0, 0, nativeCanvas.width, nativeCanvas.height);
  nctx.restore();
}
function drawSpriteNative(image, gameX, gameY, { rotation = 0, scaleX = 1, scaleY = 1, anchorX = 0.5, anchorY = 0.5 } = {}) {
  if (!image || !image.complete || !image.naturalWidth) return;
  const w = image.naturalWidth, h = image.naturalHeight;
  nctx.save();
  nctx.setTransform(nativeScale, 0, 0, nativeScale, 0, 0);
  nctx.translate(gameX, gameY);
  nctx.rotate(rotation);
  nctx.scale(scaleX, scaleY);
  nctx.drawImage(image, -w * anchorX, -h * anchorY, w, h);
  nctx.restore();
}
function beginNativeUI() {
  nctx.save();
  nctx.setTransform(nativeScale, 0, 0, nativeScale, 0, 0);
}
function endNativeUI() {
  nctx.restore();
}

let camlock = {x:0, y:0};
const ctx = {
  drawImage(img, x, y, w, h) {
    const dx = x - camlock.x + BASE_W / 2;
    const dy = y - camlock.y + BASE_H / 2;
    if (w === undefined) ctxbx.drawImage(img, dx, dy);
    else ctxbx.drawImage(img, dx, dy, w, h);
  },
  strokeRect(x, y, w, h) { ctxbx.strokeRect(x - camlock.x + BASE_W / 2, y - camlock.y + BASE_H / 2, w, h); },
  fillRect(x, y, w, h) { ctxbx.fillRect(x - camlock.x + BASE_W / 2, y - camlock.y + BASE_H / 2, w, h); },
  clearRect(x, y, w, h) { ctxbx.clearRect(x - camlock.x + BASE_W / 2, y - camlock.y + BASE_H / 2, w, h); },
  set strokeStyle(value) { ctxbx.strokeStyle = value; },
  set fillStyle(value) { ctxbx.fillStyle = value; }
};
function updateCamera() {
  camlock.x = cameraTarget.x;
  camlock.y = cameraTarget.y;
}
function drawbox(x, y, w, h) { ctx.fillRect(x, y, w, h); }
function generateHexId() { return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0"); }
function rectsOverlap(a, b) { return (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y); }
class InteractionBox {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.cb = () => {};
  }
  onInteract(cb) { this.cb = cb; return this; }
  Interaction() { this.cb(); }
}
class Sprite {
  constructor(imgSrc, x = 0, y = 0, width = 32, height = 32) {
    this.image = new Image();
    this.image.src = imgSrc;
    this.x = x; this.y = y; this.width = width; this.height = height;
    this.loaded = false;
    this.image.onload = () => { this.loaded = true; };
  }
  render() {
    if (!this.loaded) return;
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
}
class NativeRenderObject {
  constructor(imgSrc, x = 0, y = 0, { rotation = 0, scaleX = 1, scaleY = 1, anchorX = 0.5, anchorY = 0.5 } = {}) {
    this.image = new Image();
    this.image.src = imgSrc;
    this.loaded = false;
    this.image.onload = () => { this.loaded = true; };
    this.x = x; this.y = y;
    this.rotation = rotation; // radians
    this.scaleX = scaleX; this.scaleY = scaleY;
    this.anchorX = anchorX; this.anchorY = anchorY; // pivot, 0-1 of sprite size
  }
  draw(worldSpace = true) {
    const gameX = worldSpace ? (this.x - camlock.x + BASE_W / 2) : this.x;
    const gameY = worldSpace ? (this.y - camlock.y + BASE_H / 2) : this.y;
    drawSpriteNative(this.image, gameX, gameY, {
      rotation: this.rotation, scaleX: this.scaleX, scaleY: this.scaleY,
      anchorX: this.anchorX, anchorY: this.anchorY,
    });
  }
}
class Tilemap {
  constructor(tileDict, mapData, { tileSize = measure_unit, x = 0, y = 0 } = {}) {
    this.tileDict = tileDict;
    this.mapData = mapData;
    this.tileSize = tileSize;
    this.x = x;
    this.y = y;
    this.rows = mapData.length;
    this.cols = this.rows ? Math.max(...mapData.map(r => r.length)) : 0;
    this.width = this.cols * tileSize;
    this.height = this.rows * tileSize;
    this.loaded = false;
    this.canvas = null;
    this._loadAndBake();
  }
  _loadImages() {
    const images = {};
    const promises = Object.keys(this.tileDict).map(key => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => { console.warn(`Tilemap: failed to load "${key}" -> ${this.tileDict[key]}`); resolve(); };
      img.src = this.tileDict[key];
      images[key] = img;
    }));
    return Promise.all(promises).then(() => images);
  }
  async _loadAndBake() {
    const images = await this._loadImages();
    this._bakeInto(images);
  }
  _paintRows(bctx, images, rowStart, rowEnd) {
    const ts = this.tileSize;
    for (let r = rowStart; r < rowEnd; r++) {
      const row = this.mapData[r] || [];
      for (let c = 0; c < row.length; c++) {
        const key = row[c];
        if (!key || key === '#') continue;
        const img = images[key];
        if (!img || !img.complete || !img.naturalWidth) continue;
        bctx.drawImage(img, c * ts, (r - rowStart) * ts, ts, ts);
      }
    }
  }
  _bakeInto(images) {
    const bake = document.createElement('canvas');
    bake.width = this.width;
    bake.height = this.height;
    const bctx = bake.getContext('2d');
    bctx.imageSmoothingEnabled = false;
    this._paintRows(bctx, images, 0, this.rows);
    this.canvas = bake;
    this.loaded = true;
  }
  render() {
    if (!this.loaded || !this.canvas) return;
    ctx.drawImage(this.canvas, this.x, this.y, this.width, this.height);
  }
}
class DepthTilemap extends Tilemap {
  constructor(tileDict, mapData, opts = {}) {
    super(tileDict, mapData, opts);
    this.stripeRows = opts.stripeRows ?? 1;
    this.stripes = [];
  }
  _bakeInto(images) {
    this.canvas = null;
    const ts = this.tileSize;
    this.stripes = [];
    for (let r = 0; r < this.rows; r += this.stripeRows) {
      const rowEnd = Math.min(r + this.stripeRows, this.rows);
      const stripeH = (rowEnd - r) * ts;
      const bake = document.createElement('canvas');
      bake.width = this.width;
      bake.height = stripeH;
      const bctx = bake.getContext('2d');
      bctx.imageSmoothingEnabled = false;
      this._paintRows(bctx, images, r, rowEnd);
      const stripeX = this.x;
      const stripeY = this.y + r * ts;
      this.stripes.push({
        canvas: bake,
        x: stripeX, y: stripeY, w: this.width, h: stripeH,
        sortY: stripeY + stripeH,
        render() { ctx.drawImage(this.canvas, this.x, this.y, this.w, this.h); }
      });
    }
    this.loaded = true;
  }
  render() {
    if (!this.loaded) return;
    for (const s of this.stripes) s.render();
  }
  getSortables() {
    return this.stripes;
  }
}
class NineSliceTilemap {
  constructor(framePattern, { frameCount = 4, cellSize = 20, w = 1, h = 1, x = 0, y = 0, frameDelay = 8 } = {}) {
    this.cellSize = cellSize;
    this.tilesW = w;
    this.tilesH = h;
    this.x = x;
    this.y = y;
    this.width = w * cellSize;
    this.height = h * cellSize;
    this.frameCount = frameCount;
    this.frameDelay = frameDelay;
    this.frame = 0;
    this.timer = 0;
    this.loaded = false;
    this.bakedFrames = [];
    this.sheets = [];
    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.src = framePattern.replace('$0$', i);
      this.sheets.push(img);
    }
    Promise.all(this.sheets.map(img => new Promise(resolve => {
      if (img.complete && img.naturalWidth) return resolve();
      img.onload = () => resolve();
      img.onerror = () => { console.warn(`NineSliceTilemap: failed to load ${img.src}`); resolve(); };
    }))).then(() => this._bakeAll());
  }
  _sourceCellFor(col, row) {
    const cs = this.cellSize;
    const isTop = row === 0, isBottom = row === this.tilesH - 1;
    const isLeft = col === 0, isRight = col === this.tilesW - 1;
    if (isTop && isLeft) return { sx: 0, sy: 0 };
    if (isTop && isRight) return { sx: cs * 2, sy: 0 };
    if (isBottom && isLeft) return { sx: 0, sy: cs * 2 };
    if (isBottom && isRight) return { sx: cs * 2, sy: cs * 2 };
    if (isTop) return { sx: cs, sy: 0 };
    if (isBottom) return { sx: cs, sy: cs * 2 };
    if (isLeft) return { sx: 0, sy: cs };
    if (isRight) return { sx: cs * 2, sy: cs };
    return { sx: cs, sy: cs };
  }
  _bakeAll() {
    const cs = this.cellSize;
    this.bakedFrames = this.sheets.map(sheet => {
      const bake = document.createElement('canvas');
      bake.width = this.width;
      bake.height = this.height;
      const bctx = bake.getContext('2d');
      bctx.imageSmoothingEnabled = false;
      if (sheet.complete && sheet.naturalWidth) {
        for (let row = 0; row < this.tilesH; row++) {
          for (let col = 0; col < this.tilesW; col++) {
            const { sx, sy } = this._sourceCellFor(col, row);
            bctx.drawImage(sheet, sx, sy, cs, cs, col * cs, row * cs, cs, cs);
          }
        }
      }
      return bake;
    });
    this.loaded = true;
  }
  update() {
    if (this.frameCount <= 1) return;
    this.timer += dtScale;
    while (this.timer >= this.frameDelay) {
      this.timer -= this.frameDelay;
      this.frame = (this.frame + 1) % this.frameCount;
    }
  }
  render() {
    if (!this.loaded) return;
    ctx.drawImage(this.bakedFrames[this.frame], this.x, this.y, this.width, this.height);
  }
}
class AnimatedProp {
  constructor(frames, x, y, frameDelay = 8, loop = true) {
    this.frames = frames.map(src => { const i = new Image(); i.src = src; return i; });
    this.x = x; this.y = y;
    this.frameDelay = frameDelay;
    this.loop = loop;
    this.frame = 0;
    this.timer = 0;
  }
  update() {
    this.timer += dtScale;
    while (this.timer >= this.frameDelay) {
      this.timer -= this.frameDelay;
      this.frame = this.loop ? (this.frame + 1) % this.frames.length
                              : Math.min(this.frame + 1, this.frames.length - 1);
      if (!this.loop && this.frame >= this.frames.length - 1) { this.timer = 0; break; }
    }
  }
  draw() {
    const img = this.frames[this.frame];
    if (img.complete && img.naturalWidth !== 0) {
      ctx.drawImage(img, Math.round(this.x), Math.round(this.y));
    }
  }
}
// 9-slice box. Source frames are any size (e.g. 78x78); `cell` is the corner/edge
// slice size IN THE SOURCE (e.g. 36 -> 36 | 6 | 36). Corners stay fixed, the edges
// and center stretch to fill the box. Frames that fail to load are skipped, and
// `ready` is false until at least one frame has loaded.
class NineSliceBox {
  constructor(frameSrcPattern, { cell = 36, frameCount = 5, frameDelay = 8, cornerScale = 1, pingPong = false } = {}) {
    this.cell = cell;
    this.pingPong = pingPong; // play 0..n-1..1 instead of 0..n-1 (smooth loop for gradual animations)
    this.cornerScale = cornerScale;
    this.frameDelay = frameDelay;
    this.frame = 0;
    this.timer = 0;
    this.images = [];
    for (let i = 0; i < frameCount; i++) {
      const img = new Image();
      img.src = frameSrcPattern.replace('$0$', i);
      this.images.push(img);
    }
  }
  _loaded() {
    return this.images.filter(img => img.complete && img.naturalWidth > 0);
  }
  get ready() { return this._loaded().length > 0; }
  update() {
    this.timer += dtScale;
    while (this.timer >= this.frameDelay) {
      this.timer -= this.frameDelay;
      this.frame++;
    }
  }
  draw(x, y, w, h, worldSpace = false) {
    const frames = this._loaded();
    if (!frames.length) return;
    const n = frames.length, cyc = (this.pingPong && n > 1) ? 2 * n - 2 : n, k = this.frame % cyc;
    const img = frames[k < n ? k : cyc - k];
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cs = Math.min(this.cell, Math.floor(iw / 2), Math.floor(ih / 2));
    let dc = cs * this.cornerScale;          // destination corner size
    dc = Math.min(dc, w / 2, h / 2);         // never let corners overlap on tiny boxes
    const sMidW = iw - cs * 2, sMidH = ih - cs * 2;
    const dx0 = Math.round(worldSpace ? (x - camlock.x + BASE_W / 2) : x);
    const dy0 = Math.round(worldSpace ? (y - camlock.y + BASE_H / 2) : y);
    const dW = Math.round(w), dH = Math.round(h);
    const dMidW = dW - dc * 2, dMidH = dH - dc * 2;
    const sx = [0, cs, cs + sMidW], sw = [cs, sMidW, cs];
    const sy = [0, cs, cs + sMidH], sh = [cs, sMidH, cs];
    const dx = [0, dc, dc + dMidW], dw = [dc, dMidW, dc];
    const dy = [0, dc, dc + dMidH], dh = [dc, dMidH, dc];
    beginNativeUI();
    nctx.imageSmoothingEnabled = false;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (dw[c] <= 0 || dh[r] <= 0 || sw[c] <= 0 || sh[r] <= 0) continue;
        nctx.drawImage(img, sx[c], sy[r], sw[c], sh[r], dx0 + dx[c], dy0 + dy[r], dw[c], dh[r]);
      }
    }
    endNativeUI();
  }
}
// Walk cycle always starts on frame _1 (frame _0 is skipped on the first step; it only shows up later in the cycle).
const WALK_START_FRAME = 1;
class Character {
  constructor(id, x, y, spritePrefix = "", data = {}) {
    this.id = id; this.x = x; this.y = y;
    this.width = data.spr?.width || 32; this.height = data.spr?.height || 64;
    this.cullW = data.cullW ?? 40;
    this.cullH = data.cullH ?? 40;
    this.isRunning = false; this.isMoving = false;
    this.speed = 3; this.runspeed = 5;
    this.facing = "down"; this.frameCount = data.frameCount || 3; this.frame = Math.min(WALK_START_FRAME, this.frameCount);
    this.frameTimer = 0; this.frameDelay = data.frameDelay || 6;
    this.SSprite = null;
    this.spritePrefix = spritePrefix;
    this.spriteImages = {};
    this.seprunanim = data.runAnimation || false;
    this.battleFrames = data.battleFrames || {};
    this.battleFps = data.battleFps || 8;
    // Per-character draw scale. 2x-authored sprites (Ralsei) use spriteScale: 1; legacy 1x sprites can use 2 to match.
    this.spriteScale = data.spriteScale ?? SPRITE_SCALE;
    this.movementHistory = [];
    this.activeEmote = null;
    this.displayName = data.displayName || id;
    const directions = ["up", "down", "left", "right"];
    const animTypes = ["walk", "run"];
    for (let dir of directions) {
      for (let anim of animTypes) {
        for (let i = 0; i <= this.frameCount; i++) {
          const key = `${spritePrefix}_${dir}_${anim}_${i}`;
          const img = new Image(); img.src = `${Engine.config.spritePath}${key}.png`;
          this.spriteImages[key] = img;
        }
      }
      const key = `${spritePrefix}_${dir}`;
      const img = new Image(); img.src = `${Engine.config.spritePath}${key}.png`;
      this.spriteImages[key] = img;
    }
  }
  // Battle sprites: spr_<char>_battle_<action>_<frame>.png (animated) or spr_<char>_battle_<action>.png (single).
  // Action + frame are chosen at runtime. Frame counts come from data.battleFrames, e.g. { idle: 4, actionready: 2 }.
  // Images load lazily on first request; returns null until loaded so callers can fall back.
  getBattleSprite(action, frame = 0) {
    const n = (this.battleFrames && this.battleFrames[action]) || 0;
    const key = n > 0 ? `${this.spritePrefix}_battle_${action}_${frame % n}` : `${this.spritePrefix}_battle_${action}`;
    let img = this.spriteImages[key];
    if (!img) { img = new Image(); img.src = `${Engine.config.spritePath}${key}.png`; this.spriteImages[key] = img; }
    return (img.complete && img.naturalWidth) ? img : null;
  }
  playEmote({ type = 'hold', sprites = [], frameDelay = 10, endOnMove = false, sfx = null, onComplete = null }) {
    if (sfx) {
      GameAudio.playSFX(sfx);
    }
    this.activeEmote = {
      type,
      sprites,
      frameDelay,
      endOnMove,
      onComplete,
      frameTimer: 0,
      currentFrame: 0
    };
  }
  clearEmote() {
    this.activeEmote = null;
  }
  stopEmote() {
    const em = this.activeEmote;
    this.activeEmote = null;
    if (em && em.onComplete) em.onComplete();
  }
  getInteractionBox() {
    const size = this.cullW;
    let ix = this.x; let iy = this.y;
    const unit = typeof measure_unit !== 'undefined' ? measure_unit : 32;
    switch (this.facing) {
      case "up": iy -= unit; break;
      case "down": iy += unit; break;
      case "left": ix -= unit; break;
      case "right": ix += unit; break;
    }
    return { x: ix, y: iy, w: size, h: size };
  }
  setPosition(data) {
    if ('x' in data) this.x = data.x;
    if ('y' in data) this.y = data.y;
    if ('running' in data) this.isRunning = data.running;
    if ('idle' in data) {
      this.isMoving = !data.idle;
    }
    if (this.isMoving && this.activeEmote?.endOnMove) {
      this.stopEmote();
    }
    if ('frame' in data) this.frame = data.frame;
    if ('direction' in data) this.facing = data.direction;
    this.SSprite = data.specialSprite ?? null;
  }
  draw() {
    if (this.hidden) return; // battle draws party/enemy itself
    let activeSprite = null;
    if (this.activeEmote && this.activeEmote.sprites.length > 0) {
      const em = this.activeEmote;
      activeSprite = em.sprites[em.currentFrame];
      em.frameTimer += dtScale;
      if (em.frameTimer >= em.frameDelay) {
        em.frameTimer -= em.frameDelay;
        em.currentFrame++;
        if (em.currentFrame >= em.sprites.length) {
          if (em.type === 'loop') {
            em.currentFrame = 0;
          } else if (em.type === 'hold') {
            em.currentFrame = em.sprites.length - 1;
          } else {
            this.activeEmote = null;
            if (em.onComplete) em.onComplete();   // after clearing, so onComplete can start the next emote
          }
        }
      }
    } else {
      const dir = this.facing;
      const anim = this.isRunning && this.seprunanim ? "run" : "walk";
      const spriteKey = this.isMoving ? `${this.spritePrefix}_${dir}_${anim}_${this.frame}` : `${this.spritePrefix}_${dir}`;
      activeSprite = this.SSprite != null ? this.SSprite : this.spriteImages[spriteKey];
    }
    if (activeSprite?.complete && activeSprite.naturalWidth !== 0) {
      const drawW = activeSprite.naturalWidth * this.spriteScale;
      const drawH = activeSprite.naturalHeight * this.spriteScale;
      const centerX = this.x + (this.cullW - drawW) / 2;
      const bottomY = this.y + this.cullH - drawH;
      ctx.drawImage(activeSprite, Math.round(centerX), Math.round(bottomY), drawW, drawH);
    } else {
      ctx.fillStyle = "red";
      if (typeof drawbox === 'function') drawbox(this.x, this.y, this.cullW, this.cullH);
      else ctx.fillRect(this.x, this.y, this.cullW, this.cullH);
    }
  }
}
class Room {
  constructor({ name, walls = [], interactibles = [], sprites = [], characters = [], triggers = [], animatedProps = [], tilemaps = [], depthTilemaps = [], onEnter = null }) {
    this.name = name; this.walls = walls; this.interactibles = interactibles;
    this.sprites = sprites; this.characters = characters; this.triggers = triggers;
    this.animatedProps = animatedProps;
    this.tilemaps = tilemaps;
    this.depthTilemaps = depthTilemaps;
    this.onEnter = onEnter;
  }
  async load() {
    walls.length = 0; interactibles.length = 0; sprites.length = 0;
    characters.length = 0; triggers.length = 0; animatedProps.length = 0;
    tilemaps.length = 0; depthTilemaps.length = 0;
    await new Promise(resolve => setTimeout(resolve, 0));
    walls.push(...this.walls);
    interactibles.push(...this.interactibles);
    sprites.push(...this.sprites);
    characters.push(...this.characters);
    triggers.push(...this.triggers);
    animatedProps.push(...this.animatedProps);
    tilemaps.push(...this.tilemaps);
    depthTilemaps.push(...this.depthTilemaps);
    if (localPlayer) localPlayer.movementHistory = [];
    followers = [];
    if (this.onEnter) await this.onEnter();
  }
}
class Trigger {
  constructor(x, y, w, h, callback, once = true) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.callback = callback; this.once = once; this.triggered = false;
  }
  check(character) {
    if (this.triggered && this.once) return;
    if (rectsOverlap(this,{x: character.x,y: character.y,w: character.cullW,h: character.cullH})) {
      this.callback(character);
      if (this.once) this.triggered = true;
    }
  }
}
let walls = []; let interactibles = []; let sprites = []; let characters = [];
let rooms = {}; let triggers = []; let followers = []; let animatedProps = [];
let tilemaps = []; let depthTilemaps = [];
let localPlayer = null; // the game creates it and calls setPlayer()
function setPlayer(character) { localPlayer = character; return character; }
let currentRoom = null;
function addRoom(name, config) { rooms[name] = new Room({ name, ...config }); }
let wallIdCounter = 0;
function addWall(x, y, w, h, id = null) {
  const wall = { x, y, w, h, id: id ?? `wall_${wallIdCounter++}` };
  walls.push(wall);
  return wall.id;
}
function removeWall(id) {
  const idx = walls.findIndex(w => w.id === id);
  if (idx !== -1) walls.splice(idx, 1);
}
function removeWallsAt(x, y, w, h) {
  for (let i = walls.length - 1; i >= 0; i--) {
    if (rectsOverlap(walls[i], { x, y, w, h })) walls.splice(i, 1);
  }
}
async function goToRoom(name) {
  if (!rooms[name] || isTransitioning) return;
  dialogActive = false;
  GameState.closeUI('dialog');
  isTransitioning = true;
  while (transitionAlpha < 1) {
    transitionAlpha += 0.05;
    if (transitionAlpha > 1) transitionAlpha = 1;
    await new Promise(r => setTimeout(r, 16));
  }
  await rooms[name].load();
  currentRoom = rooms[name];
  while (transitionAlpha > 0) {
    transitionAlpha -= 0.05;
    if (transitionAlpha < 0) transitionAlpha = 0;
    await new Promise(r => setTimeout(r, 16));
  }
  isTransitioning = false;
}
let currentDialog = null;
let dialogIndex = 0;
let dialogCharIndex = 0;
let dialogInterval = null;
let dialogActive = false;
let fullDialogShown = false;
let currentVisibleText = "";
let dialogHoldDelay = 0;
// Toby-style dialog: nearly full width, side padding == bottom padding (margin), big pixel text.
// Deltarune-style layout (640x480 space). Text is drawn char-by-char on a fixed monospace grid (charW) so the
// font size can be smaller than the wide letter spacing the original uses. `bullet` is auto-prefixed to every
// line (wrapped lines hang under the text, not under the '*'); set bullet:false on a line to skip it.
const dialogConfig = {
  sideMargin: 24, bottomMargin: 12, topMargin: 12, height: 156,
  padX: 32, padTop: 26,                 // inner padding from the box edge to the text
  fontSize: 21, charW: 16, lineHeight: 36,
  bullet: '* ',
  portraitPad: 28, portraitGap: 18,     // portrait: vertical inset from the box edge, gap to the text
  dynamicAbove: 24,                     // a portrait taller than (box height - this) is 'dynamic': it is bottom-anchored and spills out above the frame
  portraitScale: 2,                     // EVERY portrait is drawn at world-pixel scale (1 art pixel = 1 world pixel = 2 canvas px), whatever its size
  dynamicBottom: 0,                     // dynamic portraits sit this far above the bottom of the SCREEN (0 = feet cut off by the screen edge)
  portraitFps: 6,                       // talk-animation speed for multi-frame portraits
};
// Dialog line options:  { text, portrait, position:'left'|'right', boxPosition:'top'|'bottom', bullet:false, onShow,
//                         dynamic:true|false, scale:n, dx, dy }
//  portrait = Image | [Image, Image, ...] (frames: they animate while the text types and rest on frame 0 afterwards)
//  Portraits are never fitted to the box: they are always drawn at world-pixel scale (portraitScale = 2, so their pixels match the
//  world's; scale:n overrides per line). Art that comes out taller than the box is DYNAMIC (or force it with dynamic:true): it
//  stands on the bottom edge of the screen (cropped by it), hugs the box's left/right edge and goes out of the frame over the
//  border; the text only makes room for the part of the image that is actually opaque. dx/dy nudge the portrait in pixels.
const _portraitBounds = new Map();
function portraitBounds(img) { // opaque bounding box of an image (cached); falls back to the full image if pixels can't be read
  if (_portraitBounds.has(img)) return _portraitBounds.get(img);
  let r = { l: 0, t: 0, r: img.naturalWidth, b: img.naturalHeight };
  try {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let l = c.width, t = c.height, rr = 0, bb = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < l) l = x; if (x >= rr) rr = x + 1; if (y < t) t = y; if (y >= bb) bb = y + 1; }
    if (rr > l && bb > t) r = { l, t, r: rr, b: bb };
  } catch (e) {}
  _portraitBounds.set(img, r);
  return r;
}
let dialogBoxSkin = null;
function setDialogSkin(skin) { dialogBoxSkin = skin; }
function dialogFullText(lineData) {
  const t = typeof lineData === "string" ? lineData : lineData.text;
  const b = dialogConfig.bullet, skip = typeof lineData === "object" && lineData.bullet === false;
  return (b && !skip && !t.startsWith(b)) ? b + t : t;
}
// Word-wraps on the monospace grid. Returns [{ text, start, indent }]: start = offset in the full text (so a
// typewriter can reveal it char by char without the wrapping jumping around), indent = hanging indent in chars.
function wrapDialog(text, maxChars, hang) {
  const out = []; let pos = 0;
  text.split('\n').forEach(para => {
    const words = para.split(' ');
    let line = '', lineStart = pos, wpos = pos, first = true;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (line && test.length > maxChars - (first ? 0 : hang)) {
        out.push({ text: line, start: lineStart, indent: first ? 0 : hang });
        first = false; line = w; lineStart = wpos;
      } else line = test;
      wpos += w.length + 1;
    }
    out.push({ text: line, start: lineStart, indent: first ? 0 : hang });
    pos += para.length + 1;
  });
  return out;
}
function startDialog(lines) {
  dialogActive = true;
  GameState.openUI('dialog');
  currentDialog = lines;
  dialogIndex = 0;
  startNextLine();
}
function startNextLine() {
  clearInterval(dialogInterval);
  dialogCharIndex = 0;
  fullDialogShown = false;
  currentVisibleText = "";
  const lineData = currentDialog[dialogIndex];
  const fullText = dialogFullText(lineData);
  const b = dialogConfig.bullet;
  if (b && fullText.startsWith(b)) { currentVisibleText = b; dialogCharIndex = b.length; } // bullet is shown instantly, silently

  if (lineData && typeof lineData === "object" && typeof lineData.onShow === "function") {
    lineData.onShow();
  }

  dialogInterval = setInterval(() => {
    if (dialogCharIndex < fullText.length) {
      const char = fullText[dialogCharIndex];
      currentVisibleText += char;
      dialogCharIndex++;
      
      // Play a sound for every character except blank spaces
      if (char.trim() !== "") {
        GameAudio.playSFX('snd_text', 0.5, 1);
      }
      
    } else {
      clearInterval(dialogInterval);
      fullDialogShown = true;
    }
  }, 30);
}

function showFullDialog() {
  clearInterval(dialogInterval);
  const lineData = currentDialog[dialogIndex];
  currentVisibleText = dialogFullText(lineData);
  fullDialogShown = true;
}
function nextDialog() {
  dialogIndex++;
  if (dialogIndex >= currentDialog.length) {
    dialogActive = false;
    currentDialog = null;
    GameState.closeUI('dialog');
  } else {
    startNextLine();
  }
}
function wrapText(context, text, x, y, maxWidth, lineHeight) {
  let words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + ' ';
    let metrics = context.measureText(testLine);
    let testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      context.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  context.fillText(line, x, y);
}
let _dlgWrapKey = '', _dlgWrap = [];
function drawDialogUI() {
  if (!dialogActive) return;
  const C = dialogConfig;
  const lineData = currentDialog[dialogIndex];
  const isObj = typeof lineData === "object";
  let portraitImg = isObj ? lineData.portrait : null;
  if (Array.isArray(portraitImg)) { // frames: animate while the text is typing, rest on frame 0 once it's all shown
    const fr = portraitImg;
    portraitImg = (!fullDialogShown && fr.length > 1) ? fr[Math.floor(performance.now() / (1000 / C.portraitFps)) % fr.length] : fr[0];
  }
  const portraitSide = isObj && lineData.position ? lineData.position : "left";
  const boxPosition = isObj && lineData.boxPosition ? lineData.boxPosition : "bottom";
  const boxW = BASE_W - C.sideMargin * 2;
  const boxH = C.height;
  const boxX = C.sideMargin;
  const boxY = boxPosition === "top" ? C.topMargin : BASE_H - boxH - C.bottomMargin;
  beginNativeUI();
  if (dialogBoxSkin?.ready) {
    dialogBoxSkin.update();
    endNativeUI();
    dialogBoxSkin.draw(boxX, boxY, boxW, boxH, false);
    beginNativeUI();
  } else {
    nctx.fillStyle = "#000";
    nctx.fillRect(boxX, boxY, boxW, boxH);
    nctx.strokeStyle = "white";
    nctx.lineWidth = 2;
    nctx.strokeRect(boxX + 12, boxY + 12, boxW - 24, boxH - 24);
  }
  let textX = boxX + C.padX;
  let textMaxWidth = boxW - C.padX * 2;
  if (portraitImg && portraitImg.complete && portraitImg.naturalWidth) {
    const iw = portraitImg.naturalWidth, ih = portraitImg.naturalHeight;
    const sc = (isObj && lineData.scale) || C.portraitScale; // same pixel size as the world, for small AND oversized art
    const pw = Math.round(iw * sc), ph = Math.round(ih * sc);
    const dynamic = isObj && lineData.dynamic !== undefined ? !!lineData.dynamic : ph > boxH - C.dynamicAbove;
    const dx = (isObj && lineData.dx) || 0, dy = (isObj && lineData.dy) || 0;
    nctx.imageSmoothingEnabled = false;
    if (dynamic) {
      const bd = portraitBounds(portraitImg), ol = bd.l * sc, orr = bd.r * sc; // opaque left/right edge inside the scaled image
      const py = (boxPosition === "top" ? boxY + boxH - ph : BASE_H - ph - C.dynamicBottom) + dy;
      if (portraitSide === "right") {
        const px = boxX + boxW - 4 - orr + dx;               // opaque right edge hugs the box's right edge
        nctx.drawImage(portraitImg, px, py, pw, ph);
        textMaxWidth = (px + ol - C.portraitGap) - textX;
      } else {
        const px = boxX + 4 - ol + dx;
        nctx.drawImage(portraitImg, px, py, pw, ph);
        textX = px + orr + C.portraitGap;
        textMaxWidth = boxX + boxW - C.padX - textX;
      }
    } else {
      const py = boxY + Math.round((boxH - ph) / 2) + dy;
      const px = portraitSide === "right" ? boxX + boxW - C.padX - pw + dx : textX + dx;
      nctx.drawImage(portraitImg, px, py, pw, ph);
      const reserve = pw + C.portraitGap;
      if (portraitSide !== "right") textX += reserve;
      textMaxWidth -= reserve;
    }
  }
  const full = dialogFullText(lineData);
  const maxChars = Math.max(4, Math.floor(textMaxWidth / C.charW));
  const hang = (C.bullet && full.startsWith(C.bullet)) ? C.bullet.length : 0;
  const key = `${dialogIndex}|${maxChars}|${full}`;
  if (key !== _dlgWrapKey) { _dlgWrapKey = key; _dlgWrap = wrapDialog(full, maxChars, hang); }
  const shown = currentVisibleText.length;
  nctx.fillStyle = "white";
  nctx.font = `${C.fontSize}px 'dtbase', monospace`;
  nctx.textBaseline = "middle";
  nctx.textAlign = "left";
  _dlgWrap.forEach((l, i) => {
    const n = Math.max(0, Math.min(l.text.length, shown - l.start));
    if (!n) return;
    const ly = boxY + C.padTop + C.lineHeight / 2 + i * C.lineHeight;
    for (let k = 0; k < n; k++) {
      const ch = l.text[k];
      if (ch !== ' ') nctx.fillText(ch, Math.round(textX + (l.indent + k) * C.charW), Math.round(ly));
    }
  });
  endNativeUI();
}
function handleDialogInput(inputProvider) {
  if (!dialogActive) return;
  if (dialogHoldDelay > 0) {
    dialogHoldDelay--;
    return;
  }
  const input = inputProvider();
  if (!fullDialogShown) {
    if (input.run || input.menu) {
      showFullDialog();
      dialogHoldDelay = 10;
    }
  } else {
    if (input.interact || input.menu) {
      nextDialog();
      dialogHoldDelay = 15;
    }
  }
}
let wasclick = false;
let wasDash = false;
function handleInteraction(character, inputProvider) {
  if (dialogActive || isTransitioning || overlaysBlockWorld()) return;
  const isClicking = inputProvider().interact;
  if (!isClicking || wasclick) return;
  const interactionBox = character.getInteractionBox();
  for (let obj of interactibles) {
    if (rectsOverlap(interactionBox, obj) && typeof obj.Interaction === "function") {
      obj.Interaction();
      break;
    }
  }
}
function tryMove(character, inputProvider) {
  const input = inputProvider();
  if (dialogActive || isTransitioning) {
    character.setPosition({ idle: true, frame: Math.min(WALK_START_FRAME, character.frameCount) });
    return { dx: 0, dy: 0 };
  }
  const hasHorizontal = input.left || input.right;
  const hasVertical = input.up || input.down;
  const isMoving = hasHorizontal || hasVertical;
  if (isMoving && character.activeEmote) {
    character.stopEmote();
  }
  const speed = (input.run ? character.runspeed : character.speed) * dtScale;
  let dx = 0; let dy = 0;
  if (input.up) dy = -speed;
  if (input.down) dy = speed;
  if (input.left) dx = -speed;
  if (input.right) dx = speed;
  let newX = character.x; let newY = character.y;
  const rectX = { x: newX + dx, y: newY, w: character.cullW, h: character.cullH };
  const colliders = GameState.colliders();
  if (!colliders.some(wall => rectsOverlap(rectX, wall))) newX += dx;
  const rectY = { x: newX, y: newY + dy, w: character.cullW, h: character.cullH };
  if (!colliders.some(wall => rectsOverlap(rectY, wall))) newY += dy;
  const moved = (character.x !== newX) || (character.y !== newY);
  if (moved) {
    character.frameTimer += dtScale;
    if (character.frameTimer >= character.frameDelay) {
      character.frameTimer -= character.frameDelay;
      character.frame = (character.frame + 1) % (character.frameCount + 1);
    }
  } else {
    character.frame = Math.min(WALK_START_FRAME, character.frameCount); character.frameTimer = 0;
  }
  let direction = character.facing;
  if (hasHorizontal && hasVertical) {
    const targetH = input.right ? "right" : "left";
    const targetV = input.down ? "down" : "up";
    if (direction !== targetH && direction !== targetV) {
      if (dx !== 0) direction = targetH;
      else if (dy !== 0) direction = targetV;
    }
  } else if (hasHorizontal) {
    direction = input.right ? "right" : "left";
  } else if (hasVertical) {
    direction = input.down ? "down" : "up";
  }
  character.setPosition({
    x: newX, y: newY, frame: character.frame, direction: direction,
    idle: !moved, running: !!input.run,
  });
  if (moved && Array.isArray(character.movementHistory)) {
    character.movementHistory.push({ x: newX, y: newY, frame: character.frame, direction: direction, idle: false, running: !!input.run });
    const maxHistory = (followers?.length ?? 0) * 24 + 1;
    if (character.movementHistory.length > maxHistory) character.movementHistory.shift();
  }
  return { dx: newX - character.x, dy: newY - character.y };
}
const FOLLOWER_DELAY = 24;
function updateFollowers(leader, followers, delayPerFollower = FOLLOWER_DELAY) {
  const history = leader.movementHistory;
  if (!Array.isArray(history) || history.length === 0) return;
  function getFrameData(history, delay) {
    const index = history.length - 1 - delay;
    if (index >= 0) {
        let curry = history[index];
        if (!leader.isMoving) curry.idle = true;
        return curry;
    }
    return history.length > 0 ? history[0] : { x: 0, y: 0, frame: WALK_START_FRAME, direction: 'down', idle: true, running: false };
  }
  followers.forEach((follower, index) => {
    const delay = (index + 1) * delayPerFollower;
    const frameData = getFrameData(history, delay);
    follower.setPosition({
      x: frameData.x, y: frameData.y, frame: frameData.frame,
      direction: frameData.direction, idle: frameData.idle, running: frameData.running,
    });
  });
}
function clear() { ctxbx.setTransform(MAIN_RES, 0, 0, MAIN_RES, 0, 0); ctxbx.imageSmoothingEnabled = false; ctxbx.clearRect(0, 0, BASE_W, BASE_H); }
function renderWorld() {
  updateCamera();
  clear();
  for (const tm of tilemaps) { tm.update?.(); tm.render(); }
  const renderQueue = [];
  for (const c of characters) {
    renderQueue.push({ y: c.y + c.cullH, draw: () => c.draw() });
  }
  for (const s of sprites) {
    renderQueue.push({ y: (s.y ?? 0) + (s.height ?? 0), draw: () => s.render() });
  }
  for (const p of animatedProps) {
    p.update?.();
    renderQueue.push({ y: p.y, draw: () => p.draw() });
  }
  let depthStripeCount = 0;
  for (const dtm of depthTilemaps) {
    for (const stripe of dtm.getSortables()) {
      renderQueue.push({ y: stripe.sortY, draw: () => stripe.render() });
      depthStripeCount++;
    }
  }
  renderQueue.sort((a, b) => a.y - b.y);
  for (const item of renderQueue) item.draw();
  debugStats.characters = characters.length;
  debugStats.sprites = sprites.length;
  debugStats.animatedProps = animatedProps.length;
  debugStats.tilemaps = tilemaps.length;
  debugStats.depthTilemaps = depthTilemaps.length;
  debugStats.depthStripes = depthStripeCount;
  debugStats.queueItems = renderQueue.length;
  if (isTransitioning) {
    ctxbx.fillStyle = `rgba(0,0,0,${transitionAlpha})`;
    ctxbx.fillRect(0, 0, BASE_W, BASE_H);
  }
}
const debugStats = {
  fps: 0,
  frameMs: 0,
  characters: 0,
  sprites: 0,
  animatedProps: 0,
  tilemaps: 0,
  depthTilemaps: 0,
  depthStripes: 0,
  queueItems: 0,
  overlays: 0,
  followers: 0,
  walls: 0,
};
const debugOverlay = { enabled: false };
window.Debug = {
  enable() { debugOverlay.enabled = true; console.log('[Debug] overlay ON'); },
  disable() { debugOverlay.enabled = false; console.log('[Debug] overlay OFF'); },
  toggle() { debugOverlay.enabled = !debugOverlay.enabled; console.log(`[Debug] overlay ${debugOverlay.enabled ? 'ON' : 'OFF'}`); return debugOverlay.enabled; },
  get enabled() { return debugOverlay.enabled; },
  stats: debugStats,
};
let _dbgFrameAccum = 0;
let _dbgFrameCount = 0;
function updateDebugTiming() {
  debugStats.frameMs = dt;
  _dbgFrameAccum += dt;
  _dbgFrameCount++;
  if (_dbgFrameAccum >= 250) {
    debugStats.fps = Math.round((_dbgFrameCount * 1000) / _dbgFrameAccum);
    _dbgFrameAccum = 0;
    _dbgFrameCount = 0;
  }
}
function drawDebugOverlay() {
  if (!debugOverlay.enabled) return;
  const lines = [
    `FPS: ${debugStats.fps}  (${debugStats.frameMs.toFixed(1)}ms)`,
    `Room: ${currentRoom ? currentRoom.name : '(none)'}`,
    `Chars: ${debugStats.characters}  Sprites: ${debugStats.sprites}  Props: ${debugStats.animatedProps}`,
    `Tilemaps: ${debugStats.tilemaps}  DepthMaps: ${debugStats.depthTilemaps} (${debugStats.depthStripes} stripes)`,
    `RenderQueue: ${debugStats.queueItems}  Walls: ${debugStats.walls}`,
    `State: ${GameState.name} (base: ${GameState.base})`,
    `Overlays: ${debugStats.overlays}  Followers: ${debugStats.followers}`,
    `Player: ${localPlayer ? Math.round(localPlayer.x) + ", " + Math.round(localPlayer.y) : "-"}  Cam: ${Math.round(camlock.x)}, ${Math.round(camlock.y)}`,
  ];
  beginNativeUI();
  const pad = 6, lineH = 12;
  const boxW = 240, boxH = pad * 2 + lineH * lines.length;
  nctx.fillStyle = "rgba(0,0,0,0.65)";
  nctx.fillRect(4, 4, boxW, boxH);
  nctx.strokeStyle = "#0f0";
  nctx.lineWidth = 1;
  nctx.strokeRect(4, 4, boxW, boxH);
  nctx.font = "10px monospace";
  nctx.textBaseline = "top";
  nctx.fillStyle = "#0f0";
  lines.forEach((line, i) => {
    nctx.fillText(line, 4 + pad, 4 + pad + i * lineH);
  });
  endNativeUI();
}
function gameLoop() {
  requestAnimationFrame(gameLoop);
  updateFrameTiming();
  updateDebugTiming();
  const input = keyboardInput();
  if (currentRoom && !isTransitioning) GameState.update(input);
  if (localPlayer) {
    cameraTarget.x = localPlayer.x + localPlayer.cullW / 2;
    cameraTarget.y = localPlayer.y + localPlayer.cullH / 2;
    if (Engine.onCamera) Engine.onCamera(cameraTarget); // game hook: clamp / smooth the camera
  }
  if (GameState.drawsWorld()) renderWorld();
  else { updateCamera(); clear(); }
  clearNativeCanvas();
  GameState.draw();
  drawDialogUI();
  handleDialogInput(() => input);
  updateOverlays();
  renderOverlays();
  debugStats.overlays = overlayStack.length;
  debugStats.followers = followers.length;
  debugStats.walls = walls.length;
  drawDebugOverlay();
}

// Waits for fonts, enters the world and starts the loop.
async function startEngine({ room, fonts = [], state = 'normal' } = {}) {
  await Promise.all(fonts.map(f => document.fonts.load(f)));
  GameState.set(state);
  if (room) await goToRoom(room);
  gameLoop();
}
