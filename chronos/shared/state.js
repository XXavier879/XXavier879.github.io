// state.js -- engine state machine (part of the engine; engine.js calls into it).
// Load AFTER engine.js. Games register their own states (e.g. battle) on top.
//
// BASE states (only one at a time):
//   none    nothing runs, nothing is drawn
//   normal  the regular game world (walking, talking, triggers)
//   battle  see battle.js
//   ...plus anything you register with GameState.register()
//
// UI is a LAYER on top of the base state, not a replacement for it.
// Dialogs, overlays (C-menu) and settings each open it with a reason, and
// while at least one reason is open the effective state is 'ui': nobody moves,
// the base state is suspended but still drawn underneath. Close the last
// reason and the base state resumes exactly where it was (so a dialog inside
// a battle just works).
//
// API
//   GameState.register(name, def)   def = { drawWorld, colliders(), enter(prev,data),
//                                           exit(next), suspend(), resume(),
//                                           update(input), draw() }
//   GameState.set(name, data)       switch base state (queued if UI is open)
//   GameState.openUI(reason)        GameState.closeUI(reason)
//   GameState.is('normal')          effective state check ('ui' wins over base)
//   GameState.name / .base          effective name / base name
//   GameState.colliders()           hitboxes for the current base state
//   GameState.on('change', fn)      fn({ from, to })

const GameState = (() => {
  const defs = {};
  const uiReasons = new Set();
  const events = new EventDispatcher();
  let base = 'none';
  let pending = null; // set() requested while UI was open

  function register(name, def) {
    defs[name] = { drawWorld: true, ...def };
    return defs[name];
  }

  const effective = () => (uiReasons.size ? 'ui' : base);

  function set(name, data) {
    if (name === 'ui') {
      console.warn('[GameState] "ui" is a layer, use openUI()/closeUI()');
      return false;
    }
    if (!defs[name]) {
      console.warn(`[GameState] unknown state "${name}"`);
      return false;
    }
    if (uiReasons.size) { // applied as soon as the last UI reason closes
      pending = { name, data };
      return false;
    }
    if (name === base) return false;
    const prev = base;
    defs[prev]?.exit?.(name);
    base = name;
    lockHeldInputs(); // a held Z/X/C must not leak into the new state
    defs[name].enter?.(prev, data);
    events.emit('change', { from: prev, to: name });
    return true;
  }

  function openUI(reason = 'ui') {
    const wasOpen = uiReasons.size > 0;
    uiReasons.add(reason);
    if (wasOpen) return;
    defs[base]?.suspend?.();
    defs.ui.enter?.(base);
    events.emit('change', { from: base, to: 'ui' });
  }

  function closeUI(reason = 'ui') {
    if (!uiReasons.delete(reason) || uiReasons.size) return;
    defs.ui.exit?.(base);
    defs[base]?.resume?.();
    events.emit('change', { from: 'ui', to: base });
    if (pending) {
      const p = pending;
      pending = null;
      set(p.name, p.data);
    }
  }

  return {
    register, set, openUI, closeUI,
    on: (e, cb) => events.on(e, cb),
    is: (name) => effective() === name,
    get name() { return effective(); },
    get base() { return base; },
    get uiOpen() { return uiReasons.size > 0; },
    update(input) { defs[effective()]?.update?.(input); },
    draw() {
      defs[base]?.draw?.();
      if (uiReasons.size) defs.ui.draw?.();
    },
    drawsWorld() { return defs[base]?.drawWorld !== false; },
    colliders() { return defs[base]?.colliders?.() ?? []; },
  };
})();

// Keeps the leader + followers standing still (used by ui; games may reuse it).
function freezeParty() {
  if (!localPlayer) return;
  localPlayer.setPosition({ idle: true, frame: Math.min(WALK_START_FRAME, localPlayer.frameCount) });
  if (followers.length) updateFollowers(localPlayer, followers);
}

GameState.register('none', {
  drawWorld: false,
  colliders: () => [],
});

GameState.register('normal', {
  colliders: () => walls,
  update(input) {
    if (!localPlayer) return;
    tryMove(localPlayer, () => input);
    if (followers.length) updateFollowers(localPlayer, followers);
    for (const t of triggers) t.check(localPlayer);
    handleInteraction(localPlayer, () => input);
  },
});

GameState.register('ui', {
  enter() { freezeParty(); },
  update() { freezeParty(); },
});
