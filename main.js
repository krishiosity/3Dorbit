import { installBootGuard, showBootError } from './boot.js';
import { createLoadCounter } from './loader.js';
import { createTypewriter } from './typewriter.js';
import { createDragCursor } from './cursor.js';
import { CARDS } from './scene.js';

installBootGuard();

// DOM layer first, and independent of WebGL. If three.js fails for any
// reason the name and role still render on white rather than a blank page.
const loadCounter = createLoadCounter(CARDS.length);
const cursor = createDragCursor(null);

const name = createTypewriter('Taskeen Limalia', {
  variant: 'name',
  typeMs: 105,
  holdMs: 2200
});
const role = createTypewriter('Creative Developer', {
  variant: 'role',
  typeMs: 78,
  holdMs: 2600
});
name.start(220);
role.start(900);

(async () => {
  try {
    const { createOrbitScene } = await import('./scene.js');
    const root = document.getElementById('root');
    const orbit = createOrbitScene(root, loadCounter);

    // Start rendering BEFORE the build resolves. With the keying off-thread
    // the ring can be drawn and spun while cards are still arriving, so the
    // overlay lifts on the first frame that has content instead of after all
    // sixteen finish.
    // The base spin never fully stops (there is a constant +0.0016 drift), so
    // the loop always runs — but on a phone it runs at a reduced rate when
    // nothing is being touched. Halving the frame rate while idle roughly
    // halves GPU time and keeps the device out of thermal throttling, which
    // is what causes the stutter on longer sessions.
    const isPhone = window.matchMedia('(pointer: coarse)').matches;
    let last = 0;

    const tick = (now) => {
      requestAnimationFrame(tick);
      cursor.update();
      const active = cursor.state.dragging;
      const interval = isPhone && !active ? 1000 / 30 : 0;
      if (now - last < interval) return;
      last = now;
      orbit.update(cursor);
    };
    requestAnimationFrame(tick);

    orbit.build().then(() => loadCounter.finish());

    window.addEventListener('pagehide', () => orbit.dispose(), { once: true });

    // Lift the overlay once a third of the ring is populated — enough that
    // the reveal shows a ring rather than a lone card, without holding the
    // screen for the slowest image.
    const threshold = Math.max(1, Math.ceil(orbit.total / 3));
    const poll = setInterval(() => {
      if (orbit.filled() >= threshold || loadCounter.isFinished()) {
        clearInterval(poll);
        loadCounter.finish();
      }
    }, 80);
  } catch (err) {
    // Scene failed — keep the type visible, drop the overlay, report it.
    loadCounter.finish();
    showBootError(err);
  }
})();