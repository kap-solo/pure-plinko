import { BALL, BOUNCE } from './config.js';
import { pegPosition, pegsInRow, slotToX } from './render.js';

/** Downward fall — fast at first, eases into the target. */
function easeFallDown(t) {
  return 1 - (1 - t) ** 2.6;
}

/** Fast initial velocity leaving the peg (non-zero slope at t=0). */
function easeSnapOff(t) {
  return 1 - (1 - t) ** 3.2;
}

function easeOutQuad(t) {
  return 1 - (1 - t) ** 2;
}

export function pegColForSlot(layout, row, slot) {
  const count = pegsInRow(layout, row);
  const offset = (layout.rows + 2 - count) / 2;
  const col = Math.round(slot - offset);
  return Math.max(0, Math.min(count - 1, col));
}

export function bounceRisePx(layout, bouncePop, heightScale = BOUNCE.heightScale) {
  const t = Math.max(0, bouncePop) / 5;
  return layout.rowGap * (0.25 + t * 0.85) * heightScale;
}

/** Visual + contact radii — physics tracks visual size via physicsToVisual. */
export function ballRadii(layout, ball = BALL) {
  const base = layout.pegRadius * 1.15;
  const ballRadius = base * ball.sizeMultiplier;
  const physicsRadius = ballRadius * ball.physicsToVisual;
  return { ballRadius, physicsRadius };
}

/** Cap bounce so the visual ball clears the peg row above. */
export function clampedBounceRise(layout, row, launchY, ballRadius, bouncePop) {
  const desired = bounceRisePx(layout, bouncePop);
  const clearance = 1;
  const apexMin =
    row <= 0
      ? layout.padTop + ballRadius + clearance
      : layout.padTop + layout.rowGap * row + layout.pegRadius + ballRadius + clearance;
  return Math.min(desired, Math.max(0, launchY - apexMin));
}

/** Ms for this peg row — linear ramp from startRowMs to endRowMs. */
export function rowDurationMs(row, totalRows, startRowMs, endRowMs) {
  if (totalRows <= 1) return startRowMs;
  const progress = row / (totalRows - 1);
  return startRowMs + (endRowMs - startRowMs) * progress;
}

/**
 * @returns {{ x: number, y: number, peg: { row: number, col: number } | null }}
 */
export function sampleRowMotion({
  layout,
  row,
  fromSlot,
  toSlot,
  t,
  dropY,
  ballRadius,
  physicsRadius,
  bouncePop,
}) {
  const pegCol = pegColForSlot(layout, row, fromSlot);
  const peg = pegPosition(layout, row, pegCol);
  const fromY = row === 0 ? dropY : layout.padTop + layout.rowGap * (row + 0.55);
  const nextY = layout.padTop + layout.rowGap * (row + 1.55);
  const contactY = peg.y - layout.pegRadius - physicsRadius;
  const endX = slotToX(layout, toSlot);
  const rise = clampedBounceRise(layout, row, contactY, ballRadius, bouncePop);

  const hitT = 0.2;
  let x;
  let y;
  let activePeg = null;

  if (t < hitT) {
    const u = easeFallDown(t / hitT);
    const fromX = slotToX(layout, fromSlot);
    x = fromX + (peg.x - fromX) * u;
    y = fromY + (contactY - fromY) * u;
    if (t > hitT * 0.94) activePeg = { row, col: pegCol };
  } else {
    const u = (t - hitT) / (1 - hitT);
    const launchX = peg.x;
    const launchY = contactY;
    const apexY = launchY - rise;

    const riseEnd = 0.5;

    if (u < riseEnd) {
      const ru = u / riseEnd;
      const up = easeSnapOff(ru);
      y = launchY - rise * up;
      x = launchX;
      if (u < 0.06) activePeg = { row, col: pegCol };
    } else {
      const du = (u - riseEnd) / (1 - riseEnd);
      const fall = easeFallDown(du);
      const drift = easeOutQuad(du);
      y = apexY + (nextY - apexY) * fall;
      x = launchX + (endX - launchX) * drift;
    }
  }

  return { x, y, peg: activePeg };
}
