// Procedural placeholder art.
//
// Every `assets/*` path referenced by this project is missing from the
// filesystem, so both the orbit textures and the project photos 404. Rather
// than let the ring render as 16 flat gray planes and the stack as broken
// <img> icons, these draw stand-in artwork in code.
//
// Kept strictly monochrome per the design system: warm near-black #171514 on
// warm grays, no accent hues, no border radius.

const INK = '#171514';
const SURFACE = '#ECEAE7';
const SURFACE_ALT = '#E4E1DD';

// Deterministic per-index randomness so a given card always looks the same
// across reloads and resizes.
function rand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// A square, transparent-background mark for the orbit ring. Transparent is
// what makes these read like the keyed-out cutouts they replace — a filled
// rectangle would look like a card, not an object floating in the ring.
export function makeOrbitPlaceholder(index, size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.3;
  const variant = index % 4;

  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = Math.max(2, size * 0.012);

  if (variant === 0) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    g.fill();
  } else if (variant === 1) {
    g.strokeRect(cx - r, cy - r, r * 2, r * 2);
    g.beginPath();
    g.moveTo(cx - r, cy - r);
    g.lineTo(cx + r, cy + r);
    g.moveTo(cx + r, cy - r);
    g.lineTo(cx - r, cy + r);
    g.stroke();
  } else if (variant === 2) {
    const rings = 5;
    for (let i = 0; i < rings; i++) {
      g.globalAlpha = 1 - i / (rings + 1);
      g.beginPath();
      g.arc(cx, cy, r * (1 - i / rings), 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else {
    const bars = 7;
    const w = (r * 2) / bars;
    for (let i = 0; i < bars; i++) {
      const h = r * (0.35 + rand(index * 7 + i) * 1.5);
      g.fillRect(cx - r + i * w, cy + r - h, w * 0.62, h);
    }
  }

  // Index label, so the ring reads as a numbered set rather than repeats.
  g.fillStyle = INK;
  g.font = `500 ${Math.round(size * 0.06)}px Montserrat, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText(String(index + 1).padStart(2, '0'), cx, size * 0.92);

  return c;
}

// A wide, filled placeholder for the project stack. This one IS a solid card,
// because it stands in for a full-bleed photograph.
export function makeProjectPlaceholder(index, title, w = 1600, h = 900) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');

  g.fillStyle = index % 2 === 0 ? SURFACE : SURFACE_ALT;
  g.fillRect(0, 0, w, h);

  // Sparse diagonal hatch — texture without introducing color.
  g.strokeStyle = 'rgba(23, 21, 20, 0.06)';
  g.lineWidth = 2;
  const step = 64;
  for (let x = -h; x < w; x += step) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + h, h);
    g.stroke();
  }

  // Centered geometric mark.
  const cx = w / 2;
  const cy = h / 2 - h * 0.06;
  const r = h * 0.16;
  g.strokeStyle = 'rgba(23, 21, 20, 0.28)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(cx - r * 1.5, cy);
  g.lineTo(cx + r * 1.5, cy);
  g.stroke();

  g.fillStyle = INK;
  g.textAlign = 'center';
  g.font = `500 ${Math.round(h * 0.032)}px Montserrat, system-ui, sans-serif`;
  const spaced = String(title || '').toUpperCase().split('').join('\u2009');
  g.fillText(spaced, cx, cy + r * 2.4);

  g.fillStyle = 'rgba(23, 21, 20, 0.5)';
  g.font = `500 ${Math.round(h * 0.02)}px Montserrat, system-ui, sans-serif`;
  g.fillText(
    String(index + 1).padStart(2, '0') + '\u2009\u2009/\u2009\u2009PLACEHOLDER',
    cx,
    cy + r * 3.4
  );

  return c.toDataURL('image/png');
}
