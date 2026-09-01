// Main-thread side of the keying worker: a small request/response pool.
//
// The worker is created from a Blob URL built out of the module source so it
// works from `file://` and from any static host without a separate MIME
// config. If workers or OffscreenCanvas are unavailable the client reports
// `supported: false` and the caller falls back to the synchronous path.

let workerURL = null;

export function workerSupported() {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap !== 'undefined' &&
    // Safari shipped OffscreenCanvas without `transferToImageBitmap` on some
    // versions; probing the prototype is cheaper than constructing one.
    typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  );
}

async function ensureWorkerURL() {
  if (workerURL) return workerURL;
  const res = await fetch(new URL('./keyer.worker.js', import.meta.url));
  const src = await res.text();
  const blob = new Blob([src], { type: 'text/javascript' });
  workerURL = URL.createObjectURL(blob);
  return workerURL;
}

export async function createKeyerPool(size = 2) {
  if (!workerSupported()) return null;

  let url;
  try {
    url = await ensureWorkerURL();
  } catch (e) {
    return null;
  }

  const workers = [];
  const pending = new Map();
  let nextId = 1;

  for (let i = 0; i < size; i++) {
    let w;
    try {
      w = new Worker(url);
    } catch (e) {
      break;
    }
    w.onmessage = (e) => {
      const { id } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      entry.busy.count--;
      if (e.data.ok) entry.resolve(e.data);
      else entry.reject(new Error(e.data.error));
    };
    w.onerror = () => {};
    workers.push({ w, count: 0 });
  }

  if (!workers.length) return null;

  function leastBusy() {
    let best = workers[0];
    for (const x of workers) if (x.count < best.count) best = x;
    return best;
  }

  function run(bitmap, opts) {
    const slot = leastBusy();
    slot.count++;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, busy: slot });
      slot.w.postMessage({ id, bitmap, opts }, [bitmap]);
    });
  }

  function destroy() {
    for (const x of workers) x.w.terminate();
    workers.length = 0;
    pending.clear();
  }

  return { run, destroy, size: workers.length };
}