// Custom image cursor: SVG arrow pointer that tilts and presses while dragging.
// Exposes normalized pointer velocity so the scene can react to dragging.

const CSS = `
/* The cursor must float above EVERY layer: nav (30), resume overlay (35),
   loading overlay (40) and the boot error (60). Anything lower means the
   arrow vanishes the moment you move over the menu or the resume page. */
#cursorArrow, .cursorGhost {
  position: fixed;
  top: 0;
  left: 0;
  width: 32px;
  height: 32px;
  pointer-events: none;
  z-index: 90;
  opacity: 0;
  transform-origin: 8% 6%;
  will-change: transform, opacity;
}
#cursorArrow { z-index: 92; transition: opacity 0.2s ease; }
#cursorArrow.visible { opacity: 1; }
.cursorGhost { z-index: 91; }
#cursorLabel {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 90;
  font-family: 'Montserrat', system-ui, sans-serif;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(20, 20, 20, 0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
  will-change: transform;
}
#cursorLabel.visible { opacity: 1; }
`;

// Build a sharp SVG arrow as a data URL
function buildArrowDataURL() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <polygon points="4,2 4,26 10,20 15,30 18,29 13,19 22,19" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

export function createDragCursor(target) {
  // Touch devices: no cursor to replace, and the ghost trail is wasted work.
  // Return a matching shape so the scene's drag math still runs on touch.
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if (isTouch) return createTouchDrag(target);

  // `target` is optional now. The cursor belongs to the whole document, not
  // to the canvas, so it must still exist when WebGL is unavailable and no
  // canvas was ever created.
  const canvas = target || null;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const SPRITE = buildArrowDataURL();

  const arrow = document.createElement('img');
  arrow.id = 'cursorArrow';
  arrow.alt = '';
  arrow.draggable = false;
  arrow.style.visibility = 'hidden';
  arrow.onload = () => { arrow.style.visibility = ''; };
  arrow.src = SPRITE;

  const label = document.createElement('div');
  label.id = 'cursorLabel';
  label.textContent = '';

  const GHOST_COUNT = 10;
  const ghosts = [];
  for (let i = 0; i < GHOST_COUNT; i++) {
    const g = document.createElement('img');
    g.className = 'cursorGhost';
    g.alt = '';
    g.draggable = false;
    g.style.visibility = 'hidden';
    g.onload = () => { g.style.visibility = ''; };
    g.src = SPRITE;
    g.style.zIndex = String(91 - i);
    document.body.appendChild(g);
    ghosts.push({ el: g, x: window.innerWidth / 2, y: window.innerHeight / 2, tilt: 0 });
  }

  document.body.appendChild(arrow);
  document.body.appendChild(label);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  const state = {
    x: cx, y: cy,
    prevX: cx,
    prevY: cy,
    prevY0: cy,
    moving: false,
    held: false,
    dragging: false,
    velocity: 0,
    // Vertical drag, normalized the same way `velocity` is. Kept separate
    // because the two axes drive different things: horizontal spins the ring
    // group, vertical tilts the camera. They must not be blended.
    velocityY: 0,
    tilt: 0,
    press: 0
  };

  let idleTimer = 0;

  if (canvas) canvas.style.cursor = 'none';
  document.body.style.cursor = 'none';

  // Show the arrow immediately at the centre instead of waiting for the
  // first pointermove. Otherwise the page looks cursor-less until you move.
  arrow.classList.add('visible');

  function onMove(e) {
    state.x = e.clientX;
    state.y = e.clientY;
    state.moving = true;
    arrow.classList.add('visible');
    label.classList.add('visible');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { state.moving = false; }, 110);
  }

  function onDown() {
    state.held = true;
    // Reset the delta baseline so the first drag frame can't inherit a
    // huge jump from wherever the pointer was hovering beforehand.
    state.prevX = state.x;
    state.prevY0 = state.y;
  }
  function onUp() { state.held = false; }
  function onLeave() {
    arrow.classList.remove('visible');
    label.classList.remove('visible');
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onUp);
  window.addEventListener('pointerout', (e) => { if (!e.relatedTarget) onLeave(); });

  function update() {
    const dx = state.x - state.prevX;
    const dy = state.y - state.prevY;
    state.prevX = state.x;
    state.prevY = state.y;

    // A drag requires the button to actually be HELD. Plain hover motion
    // must never feed the ring, or the orbit spins from idle mouse movement
    // and feels unresponsive to real drags.
    state.dragging = state.held;

    const targetTilt = state.moving || state.held
      ? Math.max(-22, Math.min(22, dx * 1.1))
      : 0;
    state.tilt += (targetTilt - state.tilt) * 0.16;
    state.press += ((state.dragging ? 1 : 0) - state.press) * 0.18;

    const scale = 1 - state.press * 0.14;
    arrow.style.transform =
      `translate(${state.x}px, ${state.y}px) rotate(${state.tilt}deg) scale(${scale})`;

    const speed = Math.min(1, Math.hypot(dx, state.y - state.prevY0) / 26);
    state.prevY0 = state.y;
    const visible = arrow.classList.contains('visible');

    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      const lead = i === 0 ? state : ghosts[i - 1];
      const ease = 0.42 - i * 0.018;
      g.x += (lead.x - g.x) * ease;
      g.y += (lead.y - g.y) * ease;
      g.tilt += ((i === 0 ? state.tilt : ghosts[i - 1].tilt) - g.tilt) * 0.32;

      const t = (i + 1) / (ghosts.length + 1);
      const fade = (1 - t) * 0.7;
      const gScale = scale * (1 - t * 0.55);
      g.el.style.opacity = visible ? String(fade * Math.min(1, 0.15 + speed * 1.6)) : '0';
      g.el.style.transform =
        `translate(${g.x}px, ${g.y}px) rotate(${g.tilt}deg) scale(${gScale})`;
    }

    label.style.transform =
      `translate(${state.x}px, ${state.y + 34}px) translateX(-50%)`;

    state.velocity = state.dragging ? dx / window.innerWidth : 0;
    // Vertical uses innerHeight, not innerWidth, so a drag across the short
    // axis of the window travels the same fraction of the tilt range as a
    // horizontal drag travels of the spin. Normalizing both by width would
    // make vertical feel sluggish in landscape.
    state.velocityY = state.dragging ? dy / window.innerHeight : 0;
  }

  function setLabel(text) {
    label.textContent = text || '';
  }

  return { state, update, setLabel };
}

// Minimal touch equivalent: tracks finger drag velocity in the same units so
// the ring responds identically, without any DOM cursor elements.
function createTouchDrag(target) {
  const state = {
    x: 0, y: 0, prevX: 0, prevY: 0,
    moving: false, held: false, dragging: false,
    velocity: 0, velocityY: 0, tilt: 0, press: 0
  };

  const src = target || window;

  src.addEventListener('pointerdown', (e) => {
    state.held = true;
    state.x = state.prevX = e.clientX;
    state.y = state.prevY = e.clientY;
  }, { passive: true });

  src.addEventListener('pointermove', (e) => {
    // Coalesced events: mobile Safari and Chrome batch pointer samples
    // between frames. Reading only `e.clientX` throws away the intermediate
    // positions, so a fast flick registers as a much smaller delta than the
    // finger actually travelled and the ring feels heavy. Taking the last
    // coalesced sample keeps the full travel.
    const pts = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const p = pts && pts.length ? pts[pts.length - 1] : e;
    state.x = p.clientX;
    state.y = p.clientY;
  }, { passive: true });

  const release = () => { state.held = false; };
  window.addEventListener('pointerup', release, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });

  // Cached so the per-frame velocity normalisation doesn't read layout
  // properties, which can force a style recalc on some mobile browsers.
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  window.addEventListener('resize', () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
  }, { passive: true });

  function update() {
    const dx = state.x - state.prevX;
    const dy = state.y - state.prevY;
    state.prevX = state.x;
    state.prevY = state.y;
    state.dragging = state.held;
    state.velocity = state.dragging ? dx / vw : 0;
    state.velocityY = state.dragging ? dy / vh : 0;
  }

  return { state, update, setLabel: () => {} };
}