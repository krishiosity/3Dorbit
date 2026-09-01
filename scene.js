import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { readViewport, TILT_MIN, TILT_MAX } from './viewport.js';
import { makeOrbitPlaceholder } from './placeholder.js';
import { cutout, maxWorkingSide } from './cutout.js';
import { createKeyerPool } from './keyerclient.js';

// One entry per card: path + key params tuned for THAT specific image.
// bg: 'white' = key against white/light border sample (default)
// bg: 'black' = key against black background
// loose / edgeGuard = hysteresis flood for sticker outlines
export const CARDS = [
  // --- Light / white backgrounds: default border-sample keyer ---

  // Vivienne Westwood silver pin on white. The pin's own highlights run very
  // pale, so tolerance stays moderate to avoid the flood eating into them.
  { src: 'assets/33abe0291c936ce76c5947c943fafa88.jpg', tolerance: 52, erodePx: 1, featherPx: 1 },

  // BIC lighter on white. The body is a printed silver/white wrap — nearly
  // the same value as the backdrop — so this is the most leak-prone card in
  // the set. Tight tolerance plus edgeGuard: borderline pixels are only
  // removed where the image is flat, which stops the fill at the lighter's
  // soft edge instead of swallowing the barrel.
  { src: 'assets/9672ec0a49be69a7583fc74adb8e6054.jpg', tolerance: 40, erodePx: 0, featherPx: 1, loose: 1.4, edgeGuard: 26 },

  // Evil eye nazar: deep glossy blue disc on pure white. The widest value
  // separation of any white-background card here — saturated blue is nowhere
  // near the key — so tolerance runs at 54 rather than the tight 38-42 the
  // near-white subjects (lighter, cat) require, with no leak risk.
  // erode 0 is the deliberate choice: the glass carries a bright pale
  // specular highlight right on its upper-left rim, and a single erode pass
  // would clip exactly that band and flatten the sphere's roundness. Feather
  // 1 softens the boundary without eating into the soft contact shadow at
  // the disc's edge.
  { src: 'assets/Evileye.jpg', tolerance: 54, erodePx: 0, featherPx: 1 },

  // Mean Girls phone sticker: light-gray field with a WHITE die-cut outline.
  // The outline is lighter than the backdrop it sits on, so a plain flood
  // would cross it and start deleting the sticker. Hysteresis keeps the
  // border intact.
  { src: 'assets/meangirls.jpg', tolerance: 42, erodePx: 0, featherPx: 1, loose: 1.35, edgeGuard: 30 },

  // Cat at a laptop on a NEAR-white (not pure white) field. Same leak risk
  // as the lighter: the cat's chest and muzzle are white and the MacBook lid
  // is pale silver, all close in value to the backdrop. Tight tolerance plus
  // hysteresis so the flood stops at the soft fur edge instead of crossing
  // into the white chest. erode 0 — the ear tips and whisker-thin edges are
  // only a few pixels wide.
  { src: 'assets/7b803c7cf65ee108e72b5666f1c1505a.jpg', tolerance: 38, erodePx: 0, featherPx: 1, loose: 1.45, edgeGuard: 24 },

  // --- Pure black backgrounds: dark keyer ---

  // Esc keycap. Brushed aluminium against true black, very high contrast, so
  // a tight tolerance is plenty and keeps the key's dark bevel shadow.
  { src: 'assets/escape.png', tolerance: 46, erodePx: 1, featherPx: 1, bg: 'black' },

  // Prada bag: saturated green against black. Clean separation.
  { src: 'assets/purse.png', tolerance: 48, erodePx: 1, featherPx: 1, bg: 'black' },

  // Black leather boot on black. Hardest key in the set — subject and
  // backdrop are the same hue, separated only by specular sheen on the
  // leather. Tolerance is deliberately LOW so the flood stops at the faint
  // rim light; erode is 0 because a single erode pass would chew through
  // those thin lit edges and open holes in the silhouette.
  { src: 'assets/boots.png', tolerance: 26, erodePx: 0, featherPx: 1, bg: 'black' },

  // Black lace envelope on black. Same problem as the boot, plus the lace is
  // full of real holes that the flood SHOULD reach. Low tolerance preserves
  // the pale card and the lace's lit threads.
  { src: 'assets/envelope.png', tolerance: 28, erodePx: 0, featherPx: 1, bg: 'black' },

  // Olive corduroy cap on black. Mid-tone subject, clean edge.
  { src: 'assets/Creativedirectorhat.png', tolerance: 44, erodePx: 1, featherPx: 1, bg: 'black' },

  // Heirloom tomato on pure black. The saturated red body is far from the
  // key, but the fruit's underside falls off into deep shadow that
  // approaches the backdrop value — so tolerance stays at 44 rather than the
  // wide 56 the headphones can take. Wider and the flood climbs into that
  // shadowed lower rim and shaves the bottom of the silhouette flat.
  // erode 0: the curled green sepals on the stem are thin enough that a
  // single pass would nibble them apart, and true black leaves no halo to
  // erode anyway.
  { src: 'assets/tomato.png', tolerance: 44, erodePx: 0, featherPx: 1, bg: 'black' },

  // White EarPods on pure black — the widest value separation in the whole
  // set, so tolerance can run generously without touching the subject.
  // erode is 0 and NON-NEGOTIABLE here: the coiled cable is a white line
  // only a few pixels wide at this resolution, and a single erode pass would
  // break it into dashes or sever the loops. No halo risk against true black.
  { src: 'assets/headphones.png', tolerance: 56, erodePx: 0, featherPx: 1, bg: 'black' },

  // macOS folder icon: pale blue slab on pure black. Wide value separation,
  // but the icon carries a soft drop shadow that fades into the backdrop
  // rather than ending at a hard edge. Tolerance 66 pushes the flood further
  // up that gradient so no grey fringe survives, and erode is 0 — at 54/erode
  // 1 the fringe stayed while the erode pass ate into the folder's own crisp
  // tab corners instead. Feather 2 blends what little ramp is left.
  { src: 'assets/Folder.png', tolerance: 66, erodePx: 0, featherPx: 2, bg: 'black' },

  // Ralph Lauren polo logo. The file reads as a near-uniform dark frame, so
  // the black keyer floods the entire canvas and the coverage guard swaps in
  // a placeholder — the card was never visible. `raw: true` skips keying
  // altogether and shows the image as-is, which is the only way this file can
  // appear in the ring. If a version with the mark on a clean background is
  // uploaded later, drop `raw` and key it normally.
  { src: 'assets/Ralph-Lauren-Logo.png', raw: true },

  // Yves Tumor cassette — CLEAR plastic shell on a white field. This is the
  // only genuinely translucent subject in the set, and it breaks the usual
  // white-keyer assumption: the backdrop shows THROUGH the shell, so most of
  // the cassette body is within a few values of the key colour. A normal
  // flood would enter at the top edge, pass straight through the clear
  // plastic and leave only the two dark tape reels floating in space.
  //
  // What stops it is that the shell is outlined and filled with structure —
  // the moulded rim, screw posts, the pressure pad and the white script text
  // all produce strong local contrast. So this runs at LOW tolerance with a
  // wide `loose` band and a low `edgeGuard`: the confident pass clears only
  // the flat white surround, and borderline pixels are removed strictly
  // where the image is featureless. The guard threshold sits low (18) because
  // the cassette's internal detail is subtle compared with a hard subject
  // edge, and anything higher lets the fill treat the clear window as flat.
  //
  // erode 0: the shell's edge highlight is a hairline, and the tape window's
  // moulded ribs are thinner still.
  { src: 'assets/0db6a1a0d52e059cecdb54a04849f386.jpg', tolerance: 30, erodePx: 0, featherPx: 1, loose: 1.6, edgeGuard: 18 },


];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('missing ' + src));
    img.src = src;
  });
}

// Decode straight to an ImageBitmap so the worker never touches the DOM and
// the decode itself happens off the main thread.
async function loadBitmap(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error('missing ' + src);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

// Worker path. Returns { canvas-ish source, aspect } where the source is an
// ImageBitmap — three.js accepts one directly as a texture image, so there is
// no need to draw it back into a 2D canvas on the main thread.
async function buildCardTextureWorker(pool, card, index) {
  if (!card.src) {
    return { source: makeOrbitPlaceholder(index, 512), aspect: 1 };
  }
  try {
    const bitmap = await loadBitmap(card.src);
    const res = await pool.run(bitmap, {
      tolerance: card.tolerance,
      erodePx: card.erodePx,
      featherPx: card.featherPx,
      loose: card.loose,
      edgeGuard: card.edgeGuard,
      raw: !!card.raw,
      maxSide: maxWorkingSide(),
      // The dark keyer and the light keyer differ only in what the border
      // sample returns, and the worker samples the border either way — so
      // `bg` needs no special handling there. It is passed through purely so
      // future per-mode tuning has somewhere to land.
      bg: card.bg || 'white'
    });

    if (!res.bitmap || res.bitmap.width < 8 || res.bitmap.height < 8) {
      return { source: makeOrbitPlaceholder(index, 512), aspect: 1 };
    }
    // Coverage is now measured inside the crop box, so this catches both an
    // over-keyed subject AND one hollowed out to a bare outline.
    if (!card.raw && res.coverage < 0.02) {
      res.bitmap.close();
      return { source: makeOrbitPlaceholder(index, 512), aspect: 1 };
    }
    return { source: res.bitmap, aspect: res.aspect || 1 };
  } catch (e) {
    return { source: makeOrbitPlaceholder(index, 512), aspect: 1 };
  }
}

// Resolve to a { canvas, aspect } no matter what: real keyed image when the
// file exists, procedural mark when it 404s. The ring must never be empty.
// When bg:'black', we invert the image before sampling so the flood-fill
// keyercan treat it as a light-on-dark source using the same border-sample
// logic, then we alpha-invert the result back.
async function buildCardTexture(card, index) {
  if (!card.src) {
    const canvas = makeOrbitPlaceholder(index, 512);
    return { canvas, aspect: 1 };
  }
  try {
    const img = await loadImage(card.src);

    // `raw` bypasses keying entirely: used for art that is already trimmed,
    // or for frames too uniform for a flood-fill to find an edge in.
    if (card.raw) {
      const maxSide = maxWorkingSide();
      const s = Math.min(1, maxSide / Math.max(img.width, img.height));
      const rw = Math.max(1, Math.round(img.width * s));
      const rh = Math.max(1, Math.round(img.height * s));
      const rc = document.createElement('canvas');
      rc.width = rw;
      rc.height = rh;
      rc.getContext('2d').drawImage(img, 0, 0, rw, rh);
      return { canvas: rc, aspect: rw / rh };
    }

    const out = card.bg === 'black' ? cutoutDark(img, card) : cutout(img, card);

    // Guard against a key that consumed the whole frame. This happens when
    // an image is (near) uniformly the background colour — the flood reaches
    // every pixel and the result is an empty or near-empty canvas, which
    // would render as an invisible gap in the ring. Falling back to a
    // procedural mark keeps the orbit's spacing intact.
    if (!out || !out.canvas || out.canvas.width < 8 || out.canvas.height < 8) {
      return { canvas: makeOrbitPlaceholder(index, 512), aspect: 1 };
    }
    if (isMostlyTransparent(out.canvas)) {
      return { canvas: makeOrbitPlaceholder(index, 512), aspect: 1 };
    }
    return out;
  } catch (e) {
    const canvas = makeOrbitPlaceholder(index, 512);
    return { canvas, aspect: 1 };
  }
}

// Cheap coverage test on a downsampled copy: what fraction of pixels survived
// the key. Under ~1.5% means the subject was keyed away entirely.
function isMostlyTransparent(canvas) {
  const s = 48;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, s, s);
  let kept = 0;
  try {
    const d = g.getImageData(0, 0, s, s).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 16) kept++;
  } catch (e) {
    // Read failed (memory pressure) — assume the card is fine rather than
    // replacing a good image with a placeholder.
    return false;
  }
  c.width = 1;
  c.height = 1;
  return kept / (s * s) < 0.015;
}

// For images that have a black/dark background: sample the dark border,
// flood-fill darkness, then alpha those pixels out.
function cutoutDark(image, { tolerance = 50, erodePx = 1, featherPx = 1 } = {}) {
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

  // Sample border to get background colour (should be near black)
  let br = 0, bg = 0, bb = 0, n = 0;
  const addPx = (x, y) => {
    const i = (y * w + x) * 4;
    br += p[i]; bg += p[i+1]; bb += p[i+2]; n++;
  };
  for (let x = 0; x < w; x += 2) { addPx(x, 0); addPx(x, h-1); }
  for (let y = 0; y < h; y += 2) { addPx(0, y); addPx(w-1, y); }
  br /= n; bg /= n; bb /= n;

  const tol2 = tolerance * tolerance;
  const mask = new Uint8Array(w * h).fill(255);
  const stack = [];

  const similar = (idx) => {
    const i = idx * 4;
    const dr = p[i]-br, dg = p[i+1]-bg, db = p[i+2]-bb;
    return dr*dr + dg*dg + db*db < tol2;
  };

  const push = (x, y) => {
    const idx = y * w + x;
    if (mask[idx] === 0 || !similar(idx)) return;
    mask[idx] = 0;
    stack.push(idx);
  };

  for (let x = 0; x < w; x++) { push(x, 0); push(x, h-1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w-1, y); }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w, y = (idx - x) / w;
    if (x > 0) push(x-1, y);
    if (x < w-1) push(x+1, y);
    if (y > 0) push(x, y-1);
    if (y < h-1) push(x, y+1);
  }

  // Erode then feather, matching the light keyer. Previously the mask was
  // written straight to alpha, so `erodePx`/`featherPx` were silently ignored
  // on every black-background card and all of them had hard aliased edges.
  let finalMask = mask;
  if (erodePx > 0) finalMask = erodeDark(finalMask, w, h, erodePx);
  const soft = featherPx > 0 ? blurDark(finalMask, w, h, featherPx) : finalMask;

  for (let i = 0; i < w * h; i++) {
    p[i*4+3] = Math.round(Math.min(255, soft[i]));
  }
  ctx.putImageData(data, 0, 0);

  // Crop against the FEATHERED mask, not the hard one, so the soft edge
  // isn't sliced off by the bounding box.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (soft[y*w+x] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { canvas, aspect: w/h };
  const pad = 2;
  minX = Math.max(0, minX-pad); minY = Math.max(0, minY-pad);
  maxX = Math.min(w-1, maxX+pad); maxY = Math.min(h-1, maxY+pad);
  const cw = maxX-minX+1, ch = maxY-minY+1;
  const cropped = document.createElement('canvas');
  cropped.width = cw; cropped.height = ch;
  cropped.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return { canvas: cropped, aspect: cw/ch };
}

// Local copies of the erode/blur passes for the dark keyer. Kept here rather
// than exported from cutout.js so the two keyers stay independently tunable.
function erodeDark(mask, w, h, radius) {
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

function blurDark(mask, w, h, radius) {
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

export function createOrbitScene(container, loadCounter) {
  const vp = readViewport();

  // Antialiasing costs a full extra resolve pass per frame and buys almost
  // nothing here — every card is a screen-facing textured quad with a
  // feathered alpha edge, so there are no geometric edges to alias. Dropping
  // it on mobile is the single largest per-frame saving available.
  const renderer = new THREE.WebGLRenderer({
    antialias: !vp.isPhone,
    alpha: true,
    powerPreference: 'high-performance'
  });
  // DPR 3 phones would otherwise rasterise 9x the pixels of a DPR 1 screen
  // for a scene that is mostly empty white. 1.75 is past the point where the
  // soft card edges read as sharp.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, vp.isPhone ? 1.75 : 2));
  renderer.setSize(vp.width, vp.height);
  renderer.setClearColor(0xffffff, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, vp.aspect, 0.1, 200);
  const target = new THREE.Vector3(0, vp.lift, 0);

  const ring = new THREE.Group();
  ring.position.y = vp.lift;
  scene.add(ring);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;

  let spin = 0;
  let spinVel = 0;
  let tilt = vp.restTilt;
  let dist = vp.dist;
  let radius = vp.radius;
  let cardH = vp.cardH;

  // Slots are allocated for ALL cards up front, so ring geometry is fixed
  // from frame one and each texture drops into its reserved position as it
  // arrives. Without this, streaming would re-space the ring on every
  // completion and the cards would visibly slide around during load.
  const planes = new Array(CARDS.length).fill(null);
  let filled = 0;

  function placeCards() {
    const n = planes.length;
    for (let i = 0; i < n; i++) {
      const p = planes[i];
      if (!p) continue;
      const a = (i / n) * Math.PI * 2;
      p.mesh.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
      const h = cardH;
      const w = h * p.aspect;
      p.mesh.scale.set(w, h, 1);
    }
  }

  // Turn a finished source (ImageBitmap or canvas) into a mesh at slot `i`.
  function mountCard(i, source, aspect) {
    const tex = new THREE.Texture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Max anisotropy is 16 on most mobile GPUs and is sampled per-fragment.
    // The cards face the camera, so they are never viewed at a grazing angle
    // where anisotropic filtering does anything — 4 is already generous.
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    tex.anisotropy = Math.min(maxAniso, vp.isPhone ? 2 : 8);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.02,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      opacity: 0
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.scale.set(0.0001, 0.0001, 1);
    ring.add(mesh);
    planes[i] = { mesh, aspect: aspect || 1, fade: 0 };

    // Upload immediately, then release the source. An ImageBitmap holds
    // decoded pixels outside the JS heap, and sixteen of them alive at once
    // is exactly the pressure that blanked textures on iOS before.
    renderer.initTexture(tex);
    if (source instanceof ImageBitmap) {
      source.close();
    } else if (source && 'width' in source) {
      source.width = 1;
      source.height = 1;
    }

    filled++;
    placeCards();
    if (loadCounter) loadCounter.tick();
  }

  async function build() {
    // Worker count is bounded by memory, not cores: each in-flight job holds
    // a decoded source bitmap, an ImageData copy and two Float32 mask buffers
    // at once. Phones report 6-8 cores but have a fraction of the memory
    // headroom, so they stay at 2-3.
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const poolSize = vp.isPhone
      ? mem <= 2 ? 1 : Math.min(3, Math.max(2, cores >> 2))
      : Math.min(4, Math.max(2, cores - 1));
    const pool = await createKeyerPool(poolSize);

    if (pool) {
      // Streaming path. Dispatch order is interleaved rather than sequential:
      // cards are keyed 0, 8, 4, 12, 2, ... so the first handful to land are
      // spread around the ring instead of clustered on one arc. The overlay
      // lifts at one-third coverage, and a third of a ring bunched on one
      // side reads as a broken load.
      const order = [];
      for (let step = CARDS.length; step >= 1; step = Math.floor(step / 2)) {
        for (let i = 0; i < CARDS.length; i += step) {
          if (!order.includes(i)) order.push(i);
        }
        if (step === 1) break;
      }
      for (let i = 0; i < CARDS.length; i++) {
        if (!order.includes(i)) order.push(i);
      }

      await Promise.all(
        order.map(async (i) => {
          const { source, aspect } = await buildCardTextureWorker(pool, CARDS[i], i);
          mountCard(i, source, aspect);
        })
      );
      pool.destroy();
    } else {
      // Fallback: no worker support, so keep the original sequential
      // main-thread build with a yield between cards.
      for (let i = 0; i < CARDS.length; i++) {
        const { canvas, aspect } = await buildCardTexture(CARDS[i], i);
        mountCard(i, canvas, aspect);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    placeCards();
  }

  function applyCamera() {
    const y = Math.sin(tilt) * dist;
    const horiz = Math.cos(tilt) * dist;
    camera.position.set(0, vp.lift + y, horiz);
    camera.lookAt(target);
  }

  // Mobile browsers fire `resize` on every URL-bar show/hide during a scroll
  // or a drag, and each one re-solves the camera and reallocates the drawing
  // buffer. Debounce, and ignore height-only changes small enough to be
  // chrome collapsing rather than a real orientation change.
  let resizeTimer = 0;
  let lastW = vp.width;
  let lastH = vp.height;

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === lastW && Math.abs(h - lastH) < 120) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 140);
  }

  function resize() {
    const next = readViewport();
    lastW = next.width;
    lastH = next.height;
    radius = next.radius;
    cardH = next.cardH;
    dist = next.dist;
    target.set(0, next.lift, 0);
    ring.position.y = next.lift;
    vp.lift = next.lift;
    camera.aspect = next.aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(next.width, next.height);
    placeCards();
    applyCamera();
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 220);
  });

  // A backgrounded tab on mobile keeps rAF alive briefly and then throttles
  // hard; resuming with a huge accumulated spin looks like a glitch. Reset
  // velocity on return instead.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) spinVel = 0;
  });

  // `drag` is the cursor state object from createDragCursor.
  function update(drag) {
    if (drag) {
      if (drag.state.dragging) {
        spinVel += drag.state.velocity * 2.4;
        tilt = Math.max(
          TILT_MIN,
          Math.min(TILT_MAX, tilt + drag.state.velocityY * 1.6)
        );
      }
    }
    spinVel += (0 - spinVel) * 0.06;
    spin += spinVel + 0.0016;
    ring.rotation.y = spin;

    // Skip the draw when nothing is moving and every card has finished
    // fading in. On a phone this drops the scene from a continuous 60fps
    // GPU load to near-idle whenever the user isn't touching it — the single
    // biggest battery and thermal win, and thermal throttling is what makes
    // the ring stutter after a minute on screen.
    let animating = Math.abs(spinVel) > 0.00004;
    for (let i = 0; i < planes.length; i++) {
      if (planes[i] && planes[i].fade < 1) { animating = true; break; }
    }

    // Cards always face the camera. Each also eases in from nothing as it
    // lands, so a card appearing mid-spin reads as arriving rather than
    // popping into existence.
    for (let i = 0; i < planes.length; i++) {
      const p = planes[i];
      if (!p) continue;
      p.mesh.rotation.y = -spin;
      if (p.fade < 1) {
        p.fade = Math.min(1, p.fade + 0.06);
        const e = 1 - Math.pow(1 - p.fade, 3);
        p.mesh.material.opacity = e;
        const h = cardH;
        const w = h * p.aspect;
        p.mesh.scale.set(w * (0.86 + e * 0.14), h * (0.86 + e * 0.14), 1);
      }
    }

    applyCamera();
    renderer.render(scene, camera);
    return animating;
  }

  applyCamera();

  function dispose() {
    for (const p of planes) {
      if (!p) continue;
      p.mesh.geometry.dispose();
      if (p.mesh.material.map) p.mesh.material.map.dispose();
      p.mesh.material.dispose();
    }
    controls.dispose();
    renderer.dispose();
  }

  return {
    build,
    update,
    dispose,
    renderer,
    total: CARDS.length,
    filled: () => filled
  };
}