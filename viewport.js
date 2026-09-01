// Viewport-driven layout for the orbit scene.
// A perspective camera's FOV is VERTICAL, so a narrow (portrait) viewport
// shows less horizontal world space at the same distance. The ring is a wide
// horizontal shape, so distance must grow as aspect shrinks or the left and
// right edges of the ring fall outside the frustum.

// Ring radius. This is the control that opens or closes the EMPTY MIDDLE of
// the orbit, which is where the fixed-position name/role type sits.
//
// The type stack (#typeStack) is HTML pinned at `bottom: 38%`, horizontally
// centered — it lives at screen centre and does NOT move with the 3D scene.
// So keeping the type "inside the orbit" is entirely a matter of making the
// ring's interior wide and tall enough on screen that the near arc (bottom)
// and far arc (top) both clear that text. The type never moves; the ring
// opens around it.
//
// Widened from 7.8 to give that clearance. Note this is now larger than the
// 10.4 the ring was at before it was tightened — closing the gap between the
// cards is what pulled the arcs inward over the type, so re-opening the
// middle means going back past that value, not just to it.
export const BASE_RADIUS = 9.4;
export const BASE_CARD_H = 1.2;

export function readViewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;

  // Below this the layout is treated as a phone: tighter ring, smaller cards.
  const isPhone = w <= 620;
  const isTablet = !isPhone && w <= 1024;

  // Ring radius shrinks on small screens so the cards don't need an extreme
  // camera pull-back (which would make each card unreadably small).
  const radiusScale = isPhone ? 0.62 : isTablet ? 0.82 : 1;
  const radius = BASE_RADIUS * radiusScale;

  // Cards keep a usable on-screen size by scaling UP slightly as the ring
  // tightens — otherwise shrinking the radius shrinks the whole composition.
  const cardScale = isPhone ? 1.18 : isTablet ? 1.06 : 1;
  const cardH = BASE_CARD_H * cardScale;

  // Half-width the camera must cover. Fitting the full ring plus a card's
  // diagonal (radius + cardH * 1.1) guarantees nothing ever clips, but it also
  // guarantees the ring floats inside the frame with air on both sides.
  //
  // The target framing crops instead: the ring runs off the left and right
  // edges, which reads as a slice of something larger rather than a complete
  // object sitting in a box. So the camera covers only part of the radius and
  // the extreme side cards are allowed to leave the frame.
  const FIT = aspect < 0.75 ? 0.34 : 0.78;
  const needed = radius * FIT + cardH * 1.1;

  // Solve distance from the horizontal FOV derived from the vertical one.
  const vFov = 45 * (Math.PI / 180);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distForWidth = needed / Math.tan(hFov / 2);
  const distForHeight = needed / Math.tan(vFov / 2);

  // Width is the binding constraint in portrait, height in very wide windows.
  const dist = Math.max(distForWidth, distForHeight * 0.42) * 1.06;

  // Portrait phones are the failure case: `aspect` drops below 0.5, so the
  // horizontal FOV collapses and `distForWidth` explodes. The ring ends up so
  // far back it is a thin smear near the vanishing point — or past the 40
  // clamp below, where it no longer matches the solved framing at all.
  // Tightening FIT on narrow viewports keeps the ring at a workable distance
  // and simply crops more of the side cards, which is the intended look.
  const narrow = aspect < 0.75;

  // The ring sits high so the project stack below never crowds it. On short
  // or narrow screens there is less room, so the lift eases back.
  // With no page below the ring any more, `lift` only decides how high the
  // ring sits relative to the fixed type stack. Phones have the least
  // vertical room, so the ring sits nearly centred and the type reads inside
  // it rather than being pushed off the bottom.
  const lift = isPhone ? 1.1 : isTablet ? 2.2 : 3.2;

  // How far the camera rides ABOVE the ring plane. The camera aims at `lift`
  // (the ring's own height), so this is purely the vertical offset between
  // eye and target — and it alone sets how far the ring is tilted toward the
  // viewer. At a small value the ring is seen edge-on as a flat line of
  // cards; as it grows the circle opens into an ellipse and you look down
  // INTO the ring, with the far cards riding high and small and the near
  // cards sitting low and large.
  //
  // Set SHALLOW. The target framing is a squashed ellipse: the far cards form
  // a gentle arc across the top, the near cards a gentle arc across the
  // bottom, and the vertical gap between those two arcs is only a fraction of
  // the ring's width. That is a camera skimming just above the ring plane —
  // not one looking down into it.
  //
  // These values are roughly a third of a "look down into the ring" setup.
  // Raising them re-opens the ellipse and loses the flattened look quickly:
  // this is a sensitive control, so tune it in small steps.
  //
  // Phones stay proportionally lower for the usual reason — a portrait
  // frustum has less vertical room, so the same elevation opens the ellipse
  // further relative to the frame.
  //
  // IMPORTANT: these are tuned against a reference radius, then SCALED by the
  // actual radius below. Elevation is an absolute world offset while the
  // camera distance is solved from the radius, so a fixed elevation does not
  // mean a fixed viewing ANGLE — widening the ring while holding elevation
  // constant flattens the ellipse further and pulls the top and bottom arcs
  // toward each other, which closes the empty middle. Scaling with the radius
  // holds the tilt angle steady so the ring's interior opens as intended.
  const ELEVATION_REF_RADIUS = 7.8;
  const elevationBase = isPhone ? 1.7 : isTablet ? 2.4 : 2.9;
  const elevation = elevationBase * (radius / ELEVATION_REF_RADIUS);

  const clampedDist = Math.max(6, Math.min(40, dist));

  // The same tilt expressed as an ANGLE above the ring plane, which is what
  // the drag interaction adds to. Elevation is a world-space offset, so the
  // angle it produces depends on how far back the camera sits — deriving the
  // angle here keeps the resting pose identical to what elevation alone gave
  // while letting the interaction work in degrees.
  const restTilt = Math.atan2(elevation, clampedDist);

  return {
    width: w,
    height: h,
    aspect,
    isPhone,
    isTablet,
    radius,
    cardH,
    lift,
    elevation,
    restTilt,
    dist: clampedDist,
    camY: elevation + lift
  };
}

// Tilt limits, in radians above the ring plane.
//
// The requested 45° is the TOP of the range, not a symmetric ±45°. Going 45°
// below the plane would put the camera underneath the ring looking up at the
// backs of the cards, which is not a view anyone wants to land on. The floor
// is instead just slightly below the resting pose, so the whole reachable
// band stays usable: from a hair under the current shallow skim, up to a
// full top-down look into the ring.
export const TILT_MIN = -10 * (Math.PI / 180);
export const TILT_MAX = 45 * (Math.PI / 180);