// Off-main-thread background keying.
//
// Both keyers are pure pixel math over an ImageData buffer — no DOM, no
// three.js — so they run unchanged in a worker. The main thread hands over an
// ImageBitmap (decoded off-thread by createImageBitmap), the worker draws it
// into an OffscreenCanvas, floods, erodes, feathers, crops, and ships back a
// transferred ImageBitmap. Nothing large is copied in either direction.

function sampleBorderColor(p, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  const add = (x, y) => {
    const i = (y * w + x) * 4;
    r += p[i]; g += p[i + 1]; b += p[i + 2]; n++;
  };
  for (let x = 0; x < w; x += 2) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += 2) { add(0, y); add(w - 1, y); }
  return [r / n, g / n, b / n];
}

function localContrast(p, w, h, x, y) {
  const i = (y * w + x) * 4;
  const r = p[i], g = p[i + 1], b = p[i + 2];
  let worst = 0;
  const probe = (xx, yy) => {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return;
    const j = (yy * w + xx) * 4;
    const d =
      Math.abs(p[j] - r) + Math.abs(p[j + 1] - g) + Math.abs(p[j + 2] - b);
    if (d > worst) worst = d;
  };
  probe(x - 2, y); probe(x + 2, y);
  probe(x, y - 2); probe(x, y + 2);
  return worst;
}

// Shared flood for both keyers. The only difference between the light and
// dark variants was ever the border sample and the hysteresis options, so
// there is one implementation here instead of the two near-duplicates the
// main thread used to carry.
function floodFillMask(p, w, h, tol, loose, edgeGuard) {
  const mask = new Uint8Array(w * h).fill(255);
  const [br, bg, bb] = sampleBorderColor(p, w, h);
  const tol2 = tol * tol;
  const looseTol2 = (tol * loose) * (tol * loose);

  // Typed stack instead of a JS array: a 1024x1024 flood can push a million
  // indices, and array growth was a real cost inside the old synchronous
  // pass.
  const stack = new Int32Array(w * h);
  let sp = 0;

  const similar = (idx) => {
    const i = idx * 4;
    const dr = p[i] - br, dg = p[i + 1] - bg, db = p[i + 2] - bb;
    const d = dr * dr + dg * dg + db * db;
    if (d < tol2) return true;
    if (loose <= 1 || d >= looseTol2) return false;
    if (edgeGuard <= 0) return false;
    const x = idx % w, y = (idx - x) / w;
    return localContrast(p, w, h, x, y) < edgeGuard;
  };

  const push = (x, y) => {
    const idx = y * w + x;
    if (mask[idx] === 0) return;
    if (!similar(idx)) return;
    mask[idx] = 0;
    stack[sp++] = idx;
  };

  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % w, y = (idx - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return mask;
}

function erode(mask, w, h, radius) {
  let src = mask;
  for (let pass = 0; pass < radius; pass++) {
    const out = new Uint8Array(src);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (src[idx] === 0) continue;
        if (
          (x > 0 && src[idx - 1] === 0) ||
          (x < w - 1 && src[idx + 1] === 0) ||
          (y > 0 && src[idx - w] === 0) ||
          (y < h - 1 && src[idx + w] === 0)
        ) out[idx] = 0;
      }
    }
    src = out;
  }
  return src;
}

function blurMask(mask, w, h, radius) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        sum += mask[y * w + xx];
      }
      tmp[y * w + x] = sum / span;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        sum += tmp[yy * w + x];
      }
      out[y * w + x] = sum / span;
    }
  }
  return out;
}

function key(bitmap, opts) {
  const {
    tolerance = 62,
    erodePx = 1,
    featherPx = 1,
    loose = 1,
    edgeGuard = 0,
    maxSide = 1024,
    raw = false
  } = opts;

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  if (raw) {
    return { canvas, w, h, aspect: w / h, coverage: 1 };
  }

  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;

  let mask = floodFillMask(p, w, h, tolerance, loose, edgeGuard);
  if (erodePx > 0) mask = erode(mask, w, h, erodePx);
  const soft = featherPx > 0 ? blurMask(mask, w, h, featherPx) : mask;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  let kept = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const a = soft[idx];
      p[idx * 4 + 3] = Math.round(Math.min(255, a));
      if (a > 12) {
        kept++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(data, 0, 0);

  const coverage = kept / (w * h);
  if (maxX < minX || maxY < minY) {
    return { canvas, w, h, aspect: w / h, coverage: 0 };
  }

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cropped = new OffscreenCanvas(cw, ch);
  cropped.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);

  // Coverage is reported against the CROPPED area, not the full frame. The
  // old main-thread guard measured the whole canvas, so a small subject in a
  // large frame scored low and a hollowed-out subject that kept only its
  // outline scored about the same — the two failure modes were
  // indistinguishable. Measuring inside the bounding box separates them.
  const boxCoverage = kept / (cw * ch);

  return { canvas: cropped, w: cw, h: ch, aspect: cw / ch, coverage: boxCoverage };
}

self.onmessage = async (e) => {
  const { id, bitmap, opts } = e.data;
  try {
    const res = key(bitmap, opts);
    const out = res.canvas.transferToImageBitmap();
    self.postMessage(
      { id, ok: true, bitmap: out, aspect: res.aspect, coverage: res.coverage },
      [out]
    );
  } catch (err) {
    try { bitmap.close(); } catch (_) {}
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};