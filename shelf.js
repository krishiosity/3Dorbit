import * as THREE from 'three';

// Mobile shelf layout.
//
// Instead of a ring, items rest on horizontal planks. Each shelf is its own
// looping track: a swipe scrolls every shelf together and items that pass the
// left edge wrap back in on the right, so the row "revolves" endlessly.
//
// Geometry lives in shelf-local space: x runs along the plank, y is the plank
// surface height, z is depth. The whole rig is parented to the same group the
// orbit uses, so the camera and lighting setup do not change.

export const SHELF_CONFIG = {
  rows: 3,
  gap: 2.35,        // spacing between item centers along a plank
  rowHeight: 2.5,   // vertical distance between plank surfaces
  depth: 0,
  plankThickness: 0.16,
  plankDepth: 1.5,
  overhang: 1.1     // how far the plank extends past the visible span
};

// Wood is drawn procedurally into a canvas: grain lines with slight waver plus
// a soft vertical shade. Generating it here avoids shipping a texture file and
// keeps the tone consistent with the white backdrop.
function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d');

  const base = g.createLinearGradient(0, 0, 0, c.height);
  base.addColorStop(0, '#c79a63');
  base.addColorStop(0.45, '#b8874f');
  base.addColorStop(1, '#9c6d3c');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 46; i++) {
    const y = Math.random() * c.height;
    const alpha = 0.04 + Math.random() * 0.09;
    g.strokeStyle = `rgba(88, 54, 22, ${alpha})`;
    g.lineWidth = 0.5 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= c.width; x += 24) {
      g.lineTo(x, y + Math.sin(x * 0.03 + i) * 1.6);
    }
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// A soft radial blob used as the contact shadow under each item. Without it
// the cutouts look like they float a few millimeters above the plank.
function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 32, 2, 64, 32, 60);
  grad.addColorStop(0, 'rgba(60, 40, 20, 0.42)');
  grad.addColorStop(0.55, 'rgba(60, 40, 20, 0.16)');
  grad.addColorStop(1, 'rgba(60, 40, 20, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createShelfRig(parent, count, opts = {}) {
  const cfg = { ...SHELF_CONFIG, ...opts };
  const rows = cfg.rows;

  // Distribute items across rows as evenly as possible. Remainder items go to
  // the earlier rows so the top shelf is never the sparse one.
  const perRow = [];
  const base = Math.floor(count / rows);
  let extra = count % rows;
  for (let r = 0; r < rows; r++) {
    perRow.push(base + (extra-- > 0 ? 1 : 0));
  }

  const group = new THREE.Group();
  group.name = 'shelfRig';
  parent.add(group);

  const woodTex = makeWoodTexture();
  const shadowTex = makeShadowTexture();

  const rowsMeta = [];
  const planks = [];

  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, perRow[r]);
    // span is the full loop length of this row's track. Items wrap modulo it.
    const span = n * cfg.gap;
    // Rows are laid top-down so row 0 is the highest shelf on screen.
    const y = (rows - 1 - r) * cfg.rowHeight - ((rows - 1) * cfg.rowHeight) / 2;

    rowsMeta.push({
      index: r,
      count: perRow[r],
      span,
      y,
      offset: 0,
      // Alternate the idle drift direction so the shelves don't read as one
      // solid sliding block.
      drift: r % 2 === 0 ? -1 : 1
    });

    const plankW = span + cfg.overhang * 2;
    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex.clone(),
      roughness: 0.78,
      metalness: 0.02
    });
    woodMat.map.repeat.set(Math.max(1, plankW / 4), 1);
    woodMat.map.needsUpdate = true;

    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(plankW, cfg.plankThickness, cfg.plankDepth),
      woodMat
    );
    plank.name = 'shelfPlank_' + r;
    // Sit the plank so its TOP face is exactly at the row's y. Items then rest
    // at y with no manual fudge factor.
    plank.position.set(0, y - cfg.plankThickness / 2, cfg.depth);
    group.add(plank);
    planks.push(plank);

    // Thin darker lip along the front edge reads as the shelf's face board.
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(plankW, cfg.plankThickness * 1.35, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x7d5228, roughness: 0.7 })
    );
    lip.position.set(
      0,
      y - cfg.plankThickness / 2,
      cfg.depth + cfg.plankDepth / 2 + 0.04
    );
    group.add(lip);
  }

  // Vertical side rails frame the unit and hide the plank end caps.
  const railH = rows * cfg.rowHeight + 0.6;
  const railX = rowsMeta.reduce((m, r) => Math.max(m, r.span), 0) / 2 + cfg.overhang;
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x8a5c2e,
    roughness: 0.75
  });
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, railH, cfg.plankDepth + 0.1),
      railMat
    );
    rail.position.set(sx * railX, 0, cfg.depth);
    rail.name = 'shelfRail_' + (sx < 0 ? 'L' : 'R');
    group.add(rail);
  }

  // Slot assignment: which row an item lives on and its index within that row.
  const slots = [];
  let cursor = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < perRow[r]; k++) {
      slots[cursor++] = { row: r, slot: k };
    }
  }

  function makeShadow() {
    const mat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = -1;
    return mesh;
  }

  // Position for a slot given the row's current scroll offset. The modulo
  // wrap is what makes an item leaving the left edge reappear on the right.
  function slotX(rowMeta, slotIndex) {
    const span = rowMeta.span;
    const raw = slotIndex * cfg.gap + rowMeta.offset;
    let x = ((raw % span) + span) % span;   // 0 .. span
    x -= span / 2;                          // center the track on origin
    return x;
  }

  // Items near the wrap seam are faded so they don't pop in mid-air.
  function edgeFade(x, rowMeta) {
    const half = rowMeta.span / 2;
    const d = half - Math.abs(x);
    return THREE.MathUtils.clamp(d / (cfg.gap * 0.9), 0, 1);
  }

  function dispose() {
    group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      }
    });
    parent.remove(group);
    woodTex.dispose();
    shadowTex.dispose();
  }

  return {
    group,
    rows: rowsMeta,
    slots,
    cfg,
    planks,
    makeShadow,
    slotX,
    edgeFade,
    dispose,
    // Total height of the rig, used to frame the camera.
    height: railH
  };
}
