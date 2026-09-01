// Background removal via border flood-fill + mask feathering.
// Works on light-gray / softly shaded backdrops, not just pure white.

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

// Local contrast: how much a pixel differs from its immediate neighbours.
// Subject edges (cable rims, shadow lines) score high; flat backdrop scores ~0.
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

// mask: 255 = keep (subject), 0 = remove (background)
// Two-threshold (hysteresis) fill: `tol` removes confidently-background pixels,
// while pixels out to `tol * loose` are only removed when they connect back to
// a confident region AND sit on flat, detail-free area. This lets a white
// backdrop key hard without the fill leaking into a near-white subject.
function floodFillMask(p, w, h, tol, loose = 1, edgeGuard = 0) {
  const mask = new Uint8Array(w * h).fill(255);
  const [br, bg, bb] = sampleBorderColor(p, w, h);
  const tol2 = tol * tol;
  const looseTol2 = (tol * loose) * (tol * loose);
  const stack = [];

  const dist2 = (idx) => {
    const i = idx * 4;
    const dr = p[i] - br, dg = p[i + 1] - bg, db = p[i + 2] - bb;
    return dr * dr + dg * dg + db * db;
  };

  const similar = (idx) => {
    const d = dist2(idx);
    if (d < tol2) return true;
    if (loose <= 1 || d >= looseTol2) return false;
    // Borderline shade: only treat as background where the image is flat,
    // so the fill stops at the subject's own soft edges.
    if (edgeGuard <= 0) return false;
    const x = idx % w, y = (idx - x) / w;
    return localContrast(p, w, h, x, y) < edgeGuard;
  };

  const push = (x, y) => {
    const idx = y * w + x;
    if (mask[idx] === 0) return;
    if (!similar(idx)) return;
    mask[idx] = 0;
    stack.push(idx);
  };

  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w, y = (idx - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  return mask;
}

// Erode the kept region slightly so leftover halo pixels go away
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

// Separable box blur on the mask -> soft anti-aliased alpha edge
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

// Crops fully transparent margins, returns { canvas, aspect }
// iOS Safari has a hard per-tab canvas memory budget. Sixteen 1024px source
// canvases plus their cropped copies plus GPU texture uploads blows past it,
// and `getImageData` starts throwing or returning blank data. Half-resolution
// on phones keeps the whole set well inside the budget; the cards are only a
// couple of hundred pixels on screen anyway, so nothing is visibly lost.
// With keying moved into workers, the main-thread jank half of the old 512
// cap no longer applies — only canvas memory does. Cards render a couple of
// hundred CSS pixels tall at most, so resolution is budgeted against on-screen
// size rather than source size: 768 on phones is still ~3x the rendered size
// at DPR 3, and the per-card release in `mountCard` keeps only a few bitmaps
// alive at once.
export function maxWorkingSide() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) <= 620;
  if (!(coarse || small)) return 1024;
  // Devices reporting very little memory keep the conservative cap.
  const mem = navigator.deviceMemory || 4;
  return mem <= 2 ? 512 : 768;
}

export function cutout(
  image,
  { tolerance = 62, erodePx = 1, featherPx = 1, loose = 1, edgeGuard = 0 } = {}
) {
  const maxSide = maxWorkingSide();
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;

  let mask = floodFillMask(p, w, h, tolerance, loose, edgeGuard);
  if (erodePx > 0) mask = erode(mask, w, h, erodePx);
  const soft = featherPx > 0 ? blurMask(mask, w, h, featherPx) : mask;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const a = soft[idx];
      p[idx * 4 + 3] = Math.round(Math.min(255, a));
      if (a > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(data, 0, 0);

  if (maxX < minX || maxY < minY) return { canvas, aspect: w / h };

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cropped = document.createElement('canvas');
  cropped.width = cw;
  cropped.height = ch;
  cropped.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);

  return { canvas: cropped, aspect: cw / ch };
}