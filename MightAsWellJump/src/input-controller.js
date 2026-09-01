export const INPUT_THRESHOLDS = Object.freeze({
  tapPx: 10,
  // Exactly half of the 60deg spacing between chutes: the transfer zone
  // covers the active chute's entire dedicated pie slice and nothing else,
  // so it never encroaches into a neighboring (inactive) chute's territory.
  transferSectorDeg: 30,
  radialDominance: 1.25,
  minimumGesturePx: 22
});

function normalizeAngle(deg) { return ((deg % 360) + 360) % 360; }

export function angleFromCenter(x, y, rect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  // 0 = down (6 o'clock), 90 = left, 180 = up, 270 = right.
  return normalizeAngle(Math.atan2(-dx, dy) * 180 / Math.PI);
}

export function nearestWheelStop(angleDeg) {
  return Math.round(normalizeAngle(angleDeg) / 60) % 6;
}

export function classifyGesture(start, end, boardRect) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= INPUT_THRESHOLDS.tapPx) return 'tap';

  const cx = boardRect.left + boardRect.width / 2;
  const cy = boardRect.top + boardRect.height / 2;
  const sx = start.x - cx;
  const sy = start.y - cy;
  const radialLen = Math.hypot(sx, sy) || 1;
  const ux = sx / radialLen;
  const uy = sy / radialLen;
  const radial = dx * ux + dy * uy;
  const tangential = dx * -uy + dy * ux;
  const startAngle = angleFromCenter(start.x, start.y, boardRect);
  const nearBottom = Math.min(startAngle, 360 - startAngle) <= INPUT_THRESHOLDS.transferSectorDeg;

  if (nearBottom && distance >= INPUT_THRESHOLDS.minimumGesturePx
      && Math.abs(radial) > Math.abs(tangential) * INPUT_THRESHOLDS.radialDominance) {
    return radial < 0 ? 'transfer-in' : 'transfer-out';
  }
  return 'rotate';
}

// Reads the current rotate() degree straight off an inline transform string,
// e.g. from wheel.style.transform. This is the single source of truth for
// "where is the wheel visually right now" — no separate angle state is kept.
export function parseWheelDeg(transformStr) {
  const match = /rotate\(([-\d.]+)deg\)/.exec(transformStr || '');
  return match ? parseFloat(match[1]) : 0;
}

// Computes the next continuous visual rotation for a logical wheelStop
// (0-5), choosing the shortest angular step from the wheel's *current*
// rendered angle rather than re-deriving a bounded -wheelStop*60 value from
// scratch. Re-deriving from scratch is what causes the near-360deg spin: it
// always lands in the fixed [-300, 0] range, so crossing the 0/5 wheelStop
// boundary jumps ~300deg even though only one 60deg step actually happened.
// The logical wheelStop stays authoritative and normalized (0-5); only the
// *visual* angle is allowed to grow unbounded so CSS never has to animate
// the long way around.
export function shortestSnapAngle(currentDeg, wheelStop) {
  const target = -wheelStop * 60;
  const delta = (((target - currentDeg + 180) % 360) + 360) % 360 - 180;
  return currentDeg + delta;
}

function pointInRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

// Geometric hit test for a tap release: independent of native click bubbling
// (which pointer capture on `board` breaks for descendant buttons), and
// independent of element transforms since it only needs boardRect/centerRect.
export function hitTestTap(point, boardRect, centerRect) {
  if (pointInRect(point, centerRect)) return 'center';
  const angle = angleFromCenter(point.x, point.y, boardRect);
  const nearBottom = Math.min(angle, 360 - angle) <= INPUT_THRESHOLDS.transferSectorDeg;
  return nearBottom ? 'chute' : null;
}

export function createInputController({ board, wheel, centerSlot, onRotateStop, onChuteToCenter, onCenterToChute, onTransfer, isEnabled = () => true }) {
  let drag = null;

  const pointerPoint = e => ({ x: e.clientX, y: e.clientY });

  function down(e) {
    if (!isEnabled()) return;
    const rect = board.getBoundingClientRect();
    const point = pointerPoint(e);
    drag = {
      id: e.pointerId,
      start: point,
      startAngle: angleFromCenter(point.x, point.y, rect),
      baseStop: Number(wheel.dataset.stop || 0),
      rect
    };
    board.setPointerCapture?.(e.pointerId);
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id || !isEnabled()) return;
    const point = pointerPoint(e);
    const kind = classifyGesture(drag.start, point, drag.rect);
    if (kind !== 'rotate') return;
    const currentAngle = angleFromCenter(point.x, point.y, drag.rect);
    let delta = currentAngle - drag.startAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    wheel.style.transition = 'none';
    wheel.style.transform = `rotate(${(drag.baseStop * -60) + delta}deg)`;
  }

  function angleDelta(current, point) {
    const currentAngle = angleFromCenter(point.x, point.y, current.rect);
    let delta = currentAngle - current.startAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    return delta;
  }

  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const current = drag;
    drag = null;
    wheel.style.transition = '';
    if (!isEnabled()) return;

    const point = pointerPoint(e);

    // A cancelled gesture is not a deliberate release: snap back to the
    // current stop and never commit a transfer, but still clear any
    // in-progress live-preview rotation so the wheel never sticks mid-spin.
    if (e.type === 'pointercancel') {
      onRotateStop(0);
      return;
    }

    const kind = classifyGesture(current.start, point, current.rect);
    // Snapping is unconditional: whatever the gesture resolves to, the wheel
    // must always land on a multiple of 60deg. Only a genuine 'rotate'
    // release applies the dragged delta; tap/transfer releases snap back to
    // the stop they started from (deltaStops 0) since they aren't rotations.
    const deltaStops = kind === 'rotate' ? Math.round(-angleDelta(current, point) / 60) : 0;
    onRotateStop(deltaStops);

    if (kind === 'transfer-in') return void onChuteToCenter();
    if (kind === 'transfer-out') return void onCenterToChute();
    if (kind === 'tap') {
      // Contextual tap: either zone (active chute or hub) dispatches the
      // same onTransfer() — the caller decides direction from hub
      // occupancy, not from which zone was tapped.
      const hit = hitTestTap(point, current.rect, centerSlot.getBoundingClientRect());
      if (hit === 'center' || hit === 'chute') onTransfer();
    }
  }

  board.addEventListener('pointerdown', down);
  board.addEventListener('pointermove', move);
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);

  return {
    destroy() {
      board.removeEventListener('pointerdown', down);
      board.removeEventListener('pointermove', move);
      board.removeEventListener('pointerup', end);
      board.removeEventListener('pointercancel', end);
    }
  };
}
