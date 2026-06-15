import { COLORS } from './config.js';
import { formatMult } from './math.js';

export function createBoardLayout(canvas, rows) {
  const w = canvas.width;
  const h = canvas.height;
  const padX = w * 0.06;
  const padTop = h * 0.06;
  const padBottom = h * 0.24;
  const boardW = w - padX * 2;
  const boardH = h - padTop - padBottom;
  const rowGap = boardH / (rows + 1);
  const pegRadius = Math.max(2.5, boardW / (rows + 6) * 0.045);
  const bucketY = padTop + boardH + rowGap * 0.35;

  return { w, h, padX, padTop, boardW, boardH, rowGap, pegRadius, bucketY, rows };
}

function xStep(layout) {
  return layout.boardW / (layout.rows + 1);
}

/** Fractional animation slot → x (ball path); bucket columns use bucketCenterX(). */
export function slotToX(layout, slot) {
  return layout.padX + xStep(layout) * (slot + 0.5);
}

/** Row 0 → 2 pegs, each row +1, last row (rows−1) → rows+1 pegs (18 when rows=17). */
export function pegsInRow(_layout, row) {
  return row + 2;
}

export function pegPosition(layout, row, col) {
  const count = pegsInRow(layout, row);
  const slots = layout.rows + 1;
  const offset = (slots + 1 - count) / 2;
  const x = layout.padX + xStep(layout) * (offset + col + 0.5);
  const y = layout.padTop + layout.rowGap * (row + 1);
  return { x, y };
}

/** Align with the bottom peg row (slotToX is for animation slots, offset by half a step). */
export function bucketCenterX(layout, bucketIndex) {
  const lastRow = layout.rows - 1;
  return pegPosition(layout, lastRow, bucketIndex).x;
}

/** Green at outer buckets → red at centre (symmetric). */
function bucketStyle(bucketIndex, bucketCount) {
  const center = (bucketCount - 1) / 2;
  const edgeWeight = Math.abs(bucketIndex - center) / center;
  const hue =
    COLORS.bucketHueCenter +
    (COLORS.bucketHueEdge - COLORS.bucketHueCenter) * edgeWeight;
  const bg = `hsl(${hue.toFixed(1)}, ${COLORS.bucketGradSat}%, ${COLORS.bucketGradLight}%)`;
  const text = edgeWeight < 0.42 ? '#fff' : '#ecfdf5';
  return { bg, text };
}

export function drawBoard(ctx, layout, paytable, highlightBucket = -1, activePeg = null) {
  const { rows, pegRadius, bucketY } = layout;
  ctx.clearRect(0, 0, layout.w, layout.h);

  for (let row = 0; row < rows; row += 1) {
    const cols = pegsInRow(layout, row);
    for (let col = 0; col < cols; col += 1) {
      const { x, y } = pegPosition(layout, row, col);
      const isHit = activePeg?.row === row && activePeg?.col === col;
      ctx.beginPath();
      ctx.fillStyle = isHit ? COLORS.pegActive : COLORS.peg;
      if (isHit) {
        ctx.shadowColor = COLORS.accent;
        ctx.shadowBlur = 10;
      }
      ctx.arc(x, y, isHit ? pegRadius * 1.15 : pegRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  const bucketW = layout.boardW / (rows + 1);
  const bucketH = layout.h - bucketY - 10;
  for (let i = 0; i < paytable.length; i += 1) {
    const cx = bucketCenterX(layout, i);
    const x = cx - bucketW * 0.5;
    const mult = paytable[i];
    const { bg, text } = bucketStyle(i, paytable.length);
    ctx.fillStyle = bg;
    if (i === highlightBucket) {
      ctx.shadowColor = COLORS.accent;
      ctx.shadowBlur = 14;
    }
    ctx.fillRect(x, bucketY, bucketW, bucketH);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const indexFont = Math.max(8, bucketW * 0.38);
    const multFont = Math.max(7, bucketW * 0.14);
    ctx.font = `600 ${indexFont}px system-ui, sans-serif`;
    ctx.fillStyle = text;
    ctx.globalAlpha = 0.9;
    ctx.fillText(String(i), cx, bucketY + bucketH * 0.3);
    ctx.globalAlpha = 1;
    ctx.font = `${multFont}px system-ui, sans-serif`;
    ctx.fillText(formatMult(mult), cx, bucketY + bucketH * 0.62);
  }
}

export function drawBall(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.fillStyle = COLORS.ball;
  ctx.shadowColor = 'rgba(255,255,255,0.35)';
  ctx.shadowBlur = 8;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}
