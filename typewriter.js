// Typewriter name line that sits under the orbit ring.
// Types out, holds, deletes, and loops with a blinking caret.

const CSS = `
#typeStack {
  position: fixed;
  left: 50%;
  bottom: 38%;
  transform: translateX(-50%);
  z-index: 25;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  pointer-events: none;
  box-sizing: border-box;
}
.typeLine {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 2px;
  font-family: 'Montserrat', system-ui, sans-serif;
  color: #171514;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.8s ease;
}
.typeLine.visible { opacity: 1; }
.typeLine.name {
  font-size: clamp(18px, 3.4vw, 34px);
  font-weight: 400;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.typeLine.role {
  font-size: clamp(9px, 1.1vw, 12px);
  font-weight: 500;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgba(23, 21, 20, 0.55);
}
.typeText { min-height: 1em; }
.typeCaret {
  display: inline-block;
  width: 1px;
  height: 0.95em;
  background: currentColor;
  transform: translateY(0.06em);
  animation: nameCaretBlink 1.05s steps(1, end) infinite;
}
.typeLine.role .typeCaret { height: 0.9em; }
@keyframes nameCaretBlink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@media (max-width: 520px) {
  #typeStack { bottom: 30%; gap: 9px; width: 100%; padding: 0 14px; }
  .typeLine.name { letter-spacing: 0.12em; font-size: clamp(15px, 5.4vw, 26px); }
  .typeLine.role { letter-spacing: 0.24em; font-size: clamp(8px, 2.4vw, 11px); }
}
/* Short landscape (phone on its side): the ring, type stack and scroll cue
   all compete for very little vertical room, so pull the type stack down and
   shrink it rather than letting it overlap the cue. */
@media (max-height: 520px) and (orientation: landscape) {
  #typeStack { bottom: 22%; gap: 6px; }
  .typeLine.name { font-size: clamp(14px, 2.6vw, 20px); letter-spacing: 0.1em; }
  .typeLine.role { font-size: 8px; letter-spacing: 0.2em; }
}
`;

let stackEl = null;
let stylesInjected = false;

function ensureStack() {
  if (!stylesInjected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    stylesInjected = true;
  }
  if (!stackEl || !stackEl.isConnected) {
    stackEl = document.createElement('div');
    stackEl.id = 'typeStack';
    document.body.appendChild(stackEl);
  }
  return stackEl;
}

export function createTypewriter(
  text = 'Taskeen Limalia',
  {
    typeMs = 105,
    deleteMs = 48,
    holdMs = 2200,
    gapMs = 620,
    loop = true,
    variant = 'name'
  } = {}
) {
  const stack = ensureStack();

  const wrap = document.createElement('div');
  wrap.className = 'typeLine ' + variant;
  wrap.innerHTML =
    '<span class="typeText"></span><span class="typeCaret"></span>';
  stack.appendChild(wrap);

  const out = wrap.querySelector('.typeText');

  let i = 0;
  let phase = 'typing';
  let timer = 0;
  let stopped = false;

  function schedule(fn, ms) {
    timer = setTimeout(() => { if (!stopped) fn(); }, ms);
  }

  function step() {
    if (phase === 'typing') {
      i++;
      out.textContent = text.slice(0, i);
      if (i >= text.length) {
        if (!loop) return;
        phase = 'holding';
        schedule(step, holdMs);
      } else {
        schedule(step, typeMs + Math.random() * 40);
      }
      return;
    }

    if (phase === 'holding') {
      phase = 'deleting';
      schedule(step, deleteMs);
      return;
    }

    i--;
    out.textContent = text.slice(0, Math.max(0, i));
    if (i <= 0) {
      phase = 'typing';
      schedule(step, gapMs);
    } else {
      schedule(step, deleteMs);
    }
  }

  function start(delayMs = 0) {
    wrap.classList.add('visible');
    schedule(step, delayMs);
  }

  function destroy() {
    stopped = true;
    clearTimeout(timer);
    wrap.remove();
  }

  return { start, destroy, el: wrap };
}