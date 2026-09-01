// Minimal centered loading counter that tracks asset decoding progress.

const CSS = `
#loadCounter {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  font-family: 'Montserrat', system-ui, sans-serif;
  pointer-events: none;
  opacity: 1;
  visibility: visible;
  transition: opacity 0.6s ease;
  box-sizing: border-box;
}
#loadCounter.done {
  opacity: 0;
  visibility: hidden;
}
#loadCounterInner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
#loadCounterNum {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: #171514;
  font-variant-numeric: tabular-nums;
}
#loadCounterTrack {
  width: 128px;
  height: 1px;
  background: rgba(20, 18, 16, 0.12);
  overflow: hidden;
}
#loadCounterBar {
  width: 100%;
  height: 100%;
  background: #171514;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.3s ease;
}
`;

export function createLoadCounter(total) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = 'loadCounter';
  wrap.innerHTML =
    '<div id="loadCounterInner">' +
    '<div id="loadCounterNum">0%</div>' +
    '<div id="loadCounterTrack"><div id="loadCounterBar"></div></div>' +
    '</div>';
  document.body.appendChild(wrap);

  const num = wrap.querySelector('#loadCounterNum');
  const bar = wrap.querySelector('#loadCounterBar');

  let done = 0;
  let finished = false;
  let removed = false;

  function render() {
    const frac = total > 0 ? done / total : 1;
    num.textContent = Math.round(frac * 100) + '%';
    bar.style.transform = `scaleX(${frac})`;
  }

  function destroy() {
    if (removed) return;
    removed = true;
    if (wrap.parentNode) wrap.remove();
  }

  function finish() {
    if (finished) return;
    finished = true;
    // Paint 100% first, then fade. Two rAFs guarantee the browser has
    // committed the `opacity: 1` baseline before `.done` flips it to 0,
    // otherwise the transition is skipped and the overlay can stick.
    done = total;
    render();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wrap.classList.add('done');
        setTimeout(destroy, 700);
      });
    });
    // Hard guarantee: the overlay leaves the DOM no matter what the
    // transition does.
    setTimeout(destroy, 1400);
  }

  function tick() {
    done = Math.min(total, done + 1);
    render();
    if (done >= total) finish();
  }

  render();
  // Safety net so a stalled asset can never trap the overlay on screen.
  // Phones key 16 images on a slow CPU, so the window is generous — but the
  // overlay is `pointer-events: none` and fades, so an early finish just
  // reveals a partially-built ring rather than blocking anything.
  setTimeout(finish, 9000);

  return { tick, finish, isFinished: () => finished };
}
