// Surfaces module-level failures on screen. An ES module that throws during
// evaluation leaves a silently blank page with no on-screen signal at all,
// which is indistinguishable from a styling bug. This makes it visible.

const CSS = `
#bootError {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: #ffffff;
  box-sizing: border-box;
  font-family: 'Montserrat', system-ui, sans-serif;
}
#bootErrorInner {
  max-width: 620px;
  text-align: left;
}
#bootErrorTitle {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #171514;
  margin-bottom: 14px;
}
#bootErrorMsg {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  line-height: 1.7;
  color: rgba(23, 21, 20, 0.55);
  white-space: pre-wrap;
  word-break: break-word;
}
`;

let injected = false;

export function showBootError(err) {
  if (!injected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    injected = true;
  }
  const existing = document.getElementById('bootError');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = 'bootError';
  const inner = document.createElement('div');
  inner.id = 'bootErrorInner';

  const title = document.createElement('div');
  title.id = 'bootErrorTitle';
  title.textContent = 'Scene failed to start';

  const msg = document.createElement('div');
  msg.id = 'bootErrorMsg';
  msg.textContent = (err && (err.stack || err.message)) || String(err);

  inner.appendChild(title);
  inner.appendChild(msg);
  wrap.appendChild(inner);
  document.body.appendChild(wrap);
}

export function installBootGuard() {
  window.addEventListener('error', (e) => {
    if (e.error) showBootError(e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    showBootError(e.reason);
  });
}