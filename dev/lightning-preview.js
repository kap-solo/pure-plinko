/**
 * Quick lightning strike preview — no RGS. Open via /dev/lightning-preview.html
 */

import { GAME, PAYTABLE, COLORS } from '../js/config.js';
import {
  bucketCenterX,
  createBoardLayout,
  drawBoard,
  pegPosition,
  pegsInRow,
} from '../js/render.js';
import { pegColForSlot } from '../js/physics.js';
import { buildPathSeeded } from '../js/bookMath.js';

const boardCanvas = document.getElementById('board');
const fxCanvas = document.getElementById('fx');
const boardCtx = boardCanvas.getContext('2d');
const fxCtx = fxCanvas.getContext('2d');
const strike1Btn = document.getElementById('strike-1-btn');
const strike2Btn = document.getElementById('strike-2-btn');
const strike3Btn = document.getElementById('strike-3-btn');
const statusEl = document.getElementById('status');

let layout = createBoardLayout(boardCanvas, GAME.rows);
let running = false;
let flickerSeed = 0;

/** @type {{ row: number, col: number, ballId: string, life: number }[]} */
const hotPegs = [];
/** @type {{ a: { x: number, y: number }[] | null, b: { x: number, y: number }[] | null, c: { x: number, y: number }[] | null }} */
const boltAfterimages = { a: null, b: null, c: null };

const STRIKE_BALL_IDS = ['a', 'b', 'c'];

const FX = {
  hotPegDecayMs: 360,
  afterimageAlpha: 0.14,
  secondarySkipChance: 0.32,
};

function resize() {
  const stage = boardCanvas.parentElement?.parentElement ?? boardCanvas.parentElement;
  const rect = stage.getBoundingClientRect();
  const width = Math.min(rect.width, 520);
  const height = width * (552 / 480);
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  boardCanvas.width = w;
  boardCanvas.height = h;
  fxCanvas.width = w;
  fxCanvas.height = h;
  layout = createBoardLayout(boardCanvas, GAME.rows);
  drawIdle(-1);
}

/** Static pegs + buckets — redraw only on resize, idle, or bucket highlight change. */
function paintBoard(highlightBucket = -1) {
  drawBoard(boardCtx, layout, PAYTABLE, highlightBucket);
}

function clearFxLayer() {
  fxCtx.clearRect(0, 0, layout.w, layout.h);
}

/**
 * Lightning + transient peg highlights on the overlay canvas (cleared every frame).
 * @param {{
 *   origin?: { x: number, y: number },
 *   originBallIds?: string[],
 *   activePegs?: ({ row: number, col: number } | null)[],
 *   bolts?: { waypoints: object[], seed: number, ballId: string }[],
 *   collisions?: { x: number, y: number, ballId: string, strength: number, from?: object, next?: object }[],
 *   impacts?: { x: number, y: number, ballId: string, strength: number }[],
 * }} frame
 */
function paintStrikeOverlay(frame) {
  clearFxLayer();
  drawHotPegGlows(fxCtx);

  for (const peg of frame.activePegs ?? []) {
    drawActivePegHighlight(fxCtx, peg);
  }

  if (frame.origin) {
    drawReleaseOrigin(fxCtx, frame.origin, frame.originBallIds ?? ['a']);
  }

  for (const bolt of frame.bolts ?? []) {
    drawTwinBolts(fxCtx, bolt.waypoints, bolt.seed, bolt.ballId);
  }

  for (const hit of frame.collisions ?? []) {
    drawPegCollision(fxCtx, hit.x, hit.y, hit.ballId, hit.strength);
    if (hit.from && hit.next) {
      drawDeflectStub(fxCtx, hit.from, hit.next, hit.strength, hit.ballId);
    }
  }

  for (const imp of frame.impacts ?? []) {
    drawImpactFlash(fxCtx, imp.x, imp.y, imp.strength, imp.ballId);
  }
}

/**
 * Real Plinko paths use -1 / +1 (not 0 / 1). Bucket = count of +1 moves.
 * Matches createBook() in js/bookMath.js and live books_base.jsonl.
 */
function dropForBucket(bucket, seed) {
  const path = buildPathSeeded(GAME.rows, bucket, seed);
  return { path, bucket };
}

function randomBucket() {
  return Math.floor(Math.random() * (GAME.rows + 1));
}

/** Top-centre = midpoint between the two row-0 pegs (boardW/2 is half a slot left on even row counts). */
function boardTopCenterOrigin() {
  const topCols = pegsInRow(layout, 0);
  const left = pegPosition(layout, 0, 0);
  const right = pegPosition(layout, 0, topCols - 1);
  return {
    x: (left.x + right.x) / 2,
    y: layout.padTop + layout.rowGap * 0.35,
  };
}

/** @returns {{ x: number, y: number, row?: number, col?: number }[]} */
function buildWaypoints(bucket, path) {
  const points = [];
  let slot = GAME.rows / 2;
  points.push(boardTopCenterOrigin());

  for (let row = 0; row < GAME.rows; row += 1) {
    slot += path[row] * 0.5;
    const col = pegColForSlot(layout, row, slot);
    const peg = pegPosition(layout, row, col);
    points.push({ x: peg.x, y: peg.y, row, col });
  }

  points.push({
    x: bucketCenterX(layout, bucket),
    y: layout.bucketY + layout.h * 0.06,
  });
  return points;
}

function displaceSegment(x1, y1, x2, y2, depth, seed) {
  if (depth <= 0) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const jitter = (Math.sin(seed * 12.9898 + depth * 4.141) * 43758.5453) % 1;
  const offset = (jitter - 0.5) * len * 0.22;

  const left = displaceSegment(x1, y1, mx + nx * offset, my + ny * offset, depth - 1, seed + 1);
  const right = displaceSegment(mx + nx * offset, my + ny * offset, x2, y2, depth - 1, seed + 7);
  return [...left.slice(0, -1), ...right];
}

function buildBoltPolyline(waypoints, seed) {
  const out = [];
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const seg = displaceSegment(
      waypoints[i].x,
      waypoints[i].y,
      waypoints[i + 1].x,
      waypoints[i + 1].y,
      3,
      seed + i * 13,
    );
    if (i === 0) out.push(...seg);
    else out.push(...seg.slice(1));
  }
  return out;
}

/** Sister bolt — same origin, forks outward then reconverges on that ball's bucket. */
function branchWaypoints(waypoints, seed, side = 1) {
  const last = waypoints.length - 1;
  return waypoints.map((wp, i) => {
    if (i === 0) return { ...wp };
    const taper = i / Math.max(1, last);
    const converge = 1 - taper * 0.82;
    const wobble = (Math.sin(seed * 9.17 + i * 2.31) * 43758.5453) % 1;
    const spread = (10 + wobble * 14) * converge * side;
    return { ...wp, x: wp.x + spread };
  });
}

const BALL_STYLES = {
  a: {
    branchSide: -1,
    layers: {
      primary: [
        { width: 10, color: 'rgba(80, 160, 255, 0.38)', blur: 18 },
        { width: 5, color: 'rgba(140, 220, 255, 0.75)', blur: 10 },
        { width: 2, color: 'rgba(230, 245, 255, 0.95)', blur: 4 },
      ],
      secondary: [
        { width: 7, color: 'rgba(70, 140, 255, 0.3)', blur: 14 },
        { width: 3.5, color: 'rgba(120, 200, 255, 0.58)', blur: 8 },
        { width: 1.5, color: 'rgba(210, 235, 255, 0.88)', blur: 3 },
      ],
    },
    spark: ['rgba(255, 255, 255, 0.9)', 'rgba(140, 210, 255, 0.5)', 'rgba(80, 140, 255, 0)'],
    impact: ['rgba(255, 255, 255,', 'rgba(120, 200, 255,', 'rgba(80, 140, 255, 0)'],
  },
  b: {
    branchSide: 1,
    layers: {
      primary: [
        { width: 10, color: 'rgba(255, 140, 40, 0.38)', blur: 18 },
        { width: 5, color: 'rgba(255, 190, 80, 0.75)', blur: 10 },
        { width: 2, color: 'rgba(255, 240, 210, 0.95)', blur: 4 },
      ],
      secondary: [
        { width: 7, color: 'rgba(255, 110, 30, 0.3)', blur: 14 },
        { width: 3.5, color: 'rgba(255, 170, 60, 0.58)', blur: 8 },
        { width: 1.5, color: 'rgba(255, 225, 180, 0.88)', blur: 3 },
      ],
    },
    spark: ['rgba(255, 255, 255, 0.9)', 'rgba(255, 180, 80, 0.5)', 'rgba(255, 100, 20, 0)'],
    impact: ['rgba(255, 255, 255,', 'rgba(255, 170, 60,', 'rgba(255, 90, 20, 0)'],
  },
  c: {
    branchSide: -1,
    layers: {
      primary: [
        { width: 10, color: 'rgba(160, 80, 255, 0.38)', blur: 18 },
        { width: 5, color: 'rgba(200, 140, 255, 0.75)', blur: 10 },
        { width: 2, color: 'rgba(240, 220, 255, 0.95)', blur: 4 },
      ],
      secondary: [
        { width: 7, color: 'rgba(130, 60, 255, 0.3)', blur: 14 },
        { width: 3.5, color: 'rgba(180, 110, 255, 0.58)', blur: 8 },
        { width: 1.5, color: 'rgba(225, 200, 255, 0.88)', blur: 3 },
      ],
    },
    spark: ['rgba(255, 255, 255, 0.9)', 'rgba(200, 150, 255, 0.5)', 'rgba(140, 80, 255, 0)'],
    impact: ['rgba(255, 255, 255,', 'rgba(180, 120, 255,', 'rgba(120, 60, 255, 0)'],
  },
};

function drawLightning(ctx2d, polyline, ballId, layerKey, opacity = 1) {
  if (polyline.length < 2 || opacity <= 0) return;
  const style = BALL_STYLES[ballId];
  const layers = style.layers[layerKey];

  ctx2d.save();
  ctx2d.lineCap = 'round';
  ctx2d.lineJoin = 'round';
  ctx2d.globalCompositeOperation = 'lighter';
  ctx2d.globalAlpha = opacity;

  for (const layer of layers) {
    ctx2d.beginPath();
    ctx2d.moveTo(polyline[0].x, polyline[0].y);
    for (let i = 1; i < polyline.length; i += 1) {
      ctx2d.lineTo(polyline[i].x, polyline[i].y);
    }
    ctx2d.strokeStyle = layer.color;
    ctx2d.lineWidth = layer.width;
    ctx2d.shadowColor = layer.color;
    ctx2d.shadowBlur = layer.blur;
    ctx2d.stroke();
  }

  ctx2d.restore();
}

function flickerRoll(seed, salt) {
  return (Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453) % 1;
}

function clearStrikeEffects() {
  hotPegs.length = 0;
  for (const id of STRIKE_BALL_IDS) boltAfterimages[id] = null;
}

function markHotPeg(row, col, ballId) {
  const existing = hotPegs.find((p) => p.row === row && p.col === col);
  if (existing) {
    existing.life = 1;
    existing.ballId = ballId;
    return;
  }
  hotPegs.push({ row, col, ballId, life: 1 });
}

function tickVisualEffects(dtMs) {
  for (let i = hotPegs.length - 1; i >= 0; i -= 1) {
    hotPegs[i].life -= dtMs / FX.hotPegDecayMs;
    if (hotPegs[i].life <= 0) hotPegs.splice(i, 1);
  }
}

function drawHotPegGlows(ctx2d) {
  for (const peg of hotPegs) {
    const { x, y } = pegPosition(layout, peg.row, peg.col);
    const tint =
      peg.ballId === 'a'
        ? { inner: 'rgba(200, 240, 255, 0.95)', mid: 'rgba(100, 180, 255,', outer: 'rgba(60, 120, 255, 0)' }
        : peg.ballId === 'c'
          ? { inner: 'rgba(230, 210, 255, 0.95)', mid: 'rgba(160, 100, 255,', outer: 'rgba(100, 50, 255, 0)' }
          : { inner: 'rgba(255, 230, 170, 0.95)', mid: 'rgba(255, 160, 50,', outer: 'rgba(255, 90, 20, 0)' };
    const glowR = layout.pegRadius * (2.2 + peg.life * 1.8);

    ctx2d.save();
    ctx2d.globalCompositeOperation = 'lighter';
    const grad = ctx2d.createRadialGradient(x, y, 0, x, y, glowR);
    grad.addColorStop(0, `${tint.mid} ${0.45 * peg.life})`);
    grad.addColorStop(0.45, `${tint.mid} ${0.15 * peg.life})`);
    grad.addColorStop(1, tint.outer);
    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.arc(x, y, glowR, 0, Math.PI * 2);
    ctx2d.fill();

    ctx2d.fillStyle = tint.inner;
    ctx2d.globalAlpha = 0.35 + peg.life * 0.65;
    ctx2d.shadowColor = tint.inner;
    ctx2d.shadowBlur = 6 + peg.life * 12;
    ctx2d.beginPath();
    ctx2d.arc(x, y, layout.pegRadius * (1.05 + peg.life * 0.25), 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();
  }
}

async function finishFrame(ms) {
  await sleep(ms);
  tickVisualEffects(ms);
}

function isPegWaypoint(wp) {
  return wp?.row != null && wp?.col != null;
}

function drawTwinBolts(ctx2d, waypoints, seed, ballId) {
  const style = BALL_STYLES[ballId];
  const prev = boltAfterimages[ballId];
  if (prev) {
    drawLightning(ctx2d, prev, ballId, 'primary', FX.afterimageAlpha);
  }

  const flickerOpacity = 0.72 + Math.abs(flickerRoll(seed, 3.1)) * 0.28;
  const showSecondary = Math.abs(flickerRoll(seed, 9.7)) > FX.secondarySkipChance;
  const primary = buildBoltPolyline(waypoints, seed);
  drawLightning(ctx2d, primary, ballId, 'primary', flickerOpacity);

  if (showSecondary) {
    const branch = branchWaypoints(waypoints, seed, style.branchSide);
    drawLightning(
      ctx2d,
      buildBoltPolyline(branch, seed + 913),
      ballId,
      'secondary',
      flickerOpacity * 0.82,
    );
  }

  boltAfterimages[ballId] = primary;
}

/** Short segment leaving the peg — sells a bounce before the next leg draws. */
function drawDeflectStub(ctx2d, from, to, progress, ballId) {
  if (progress <= 0) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const stubLen = len * progress * STRIKE_TIMING.deflectStubMax;
  const ex = from.x + (dx / len) * stubLen;
  const ey = from.y + (dy / len) * stubLen;
  const style = BALL_STYLES[ballId].layers.primary[1];

  ctx2d.save();
  ctx2d.globalCompositeOperation = 'lighter';
  ctx2d.lineCap = 'round';
  ctx2d.beginPath();
  ctx2d.moveTo(from.x, from.y);
  ctx2d.lineTo(ex, ey);
  ctx2d.strokeStyle = style.color;
  ctx2d.lineWidth = style.width + 2;
  ctx2d.shadowColor = style.color;
  ctx2d.shadowBlur = style.blur + 6;
  ctx2d.stroke();
  ctx2d.restore();
}

function drawPegCollision(ctx2d, x, y, ballId, strength) {
  const accent =
    ballId === 'a'
      ? { mid: 'rgba(180, 235, 255, 0.95)', outer: 'rgba(80, 160, 255, 0)' }
      : ballId === 'c'
        ? { mid: 'rgba(210, 170, 255, 0.95)', outer: 'rgba(120, 60, 255, 0)' }
        : { mid: 'rgba(255, 210, 120, 0.95)', outer: 'rgba(255, 100, 20, 0)' };
  const core = layout.pegRadius * (1.1 + strength * 0.8);
  const burst = layout.pegRadius * (2.2 + strength * 2.5);

  ctx2d.save();
  ctx2d.globalCompositeOperation = 'lighter';

  const grad = ctx2d.createRadialGradient(x, y, 0, x, y, burst);
  grad.addColorStop(0, `rgba(255, 255, 255, ${0.55 + strength * 0.4})`);
  grad.addColorStop(0.2, accent.mid);
  grad.addColorStop(1, accent.outer);
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.arc(x, y, burst, 0, Math.PI * 2);
  ctx2d.fill();

  ctx2d.fillStyle = '#fff';
  ctx2d.shadowColor = accent.mid;
  ctx2d.shadowBlur = 12 + strength * 10;
  ctx2d.beginPath();
  ctx2d.arc(x, y, core, 0, Math.PI * 2);
  ctx2d.fill();

  const sparks = 5 + Math.floor(strength * 3);
  for (let i = 0; i < sparks; i += 1) {
    const angle = (i / sparks) * Math.PI * 2 + strength * 1.7;
    const sparkLen = layout.pegRadius * (1.5 + strength * 2.2);
    ctx2d.beginPath();
    ctx2d.moveTo(x, y);
    ctx2d.lineTo(x + Math.cos(angle) * sparkLen, y + Math.sin(angle) * sparkLen);
    ctx2d.strokeStyle = `rgba(255, 255, 255, ${0.35 + strength * 0.45})`;
    ctx2d.lineWidth = 1.2;
    ctx2d.stroke();
  }

  ctx2d.shadowBlur = 0;
  ctx2d.restore();
}

function drawOriginSpark(ctx2d, origin, ballId) {
  const [inner, mid, outer] = BALL_STYLES[ballId].spark;
  const grad = ctx2d.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 22);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, mid);
  grad.addColorStop(1, outer);
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.arc(origin.x, origin.y, 22, 0, Math.PI * 2);
  ctx2d.fill();
}

function drawImpactFlash(ctx2d, x, y, strength, ballId) {
  const palette = BALL_STYLES[ballId].impact;
  const grad = ctx2d.createRadialGradient(x, y, 0, x, y, 40 + strength * 30);
  grad.addColorStop(0, `${palette[0]} ${0.35 + strength * 0.25})`);
  grad.addColorStop(0.35, `${palette[1]} ${0.2 + strength * 0.15})`);
  grad.addColorStop(1, palette[2]);
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.arc(x, y, 50 + strength * 40, 0, Math.PI * 2);
  ctx2d.fill();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawIdle(highlightBucket = -1) {
  if (!running) clearStrikeEffects();
  paintBoard(highlightBucket);
  clearFxLayer();
}

function drawActivePegHighlight(ctx2d, peg) {
  if (!peg) return;
  const { x, y } = pegPosition(layout, peg.row, peg.col);
  ctx2d.beginPath();
  ctx2d.fillStyle = COLORS.pegActive;
  ctx2d.shadowColor = COLORS.accent;
  ctx2d.shadowBlur = 10;
  ctx2d.arc(x, y, layout.pegRadius * 1.15, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.shadowBlur = 0;
}

function activePegAt(waypoints, end) {
  const wp = waypoints[end];
  if (wp?.row != null && wp?.col != null) {
    return { row: wp.row, col: wp.col };
  }
  return null;
}

function formatMultShort(mult) {
  return mult >= 1000 ? `${(mult / 1000).toFixed(0)}k` : `${mult}×`;
}

/** Tune strike speed — higher ms = slower bolt. */
const STRIKE_TIMING = {
  flickerFramesPerRow: 1,
  flickerMs: 14,
  rowMs: 7,
  impactFrames: 3,
  impactFrameMs: 29,
  /** Gap between back-to-back strikes (2 / 3 Strikes buttons). */
  consecutiveGapMs: 58,
  /** Extra frames held on each peg hit (collision beat). */
  pegHitFrames: 4,
  pegHitPauseMs: 16,
  /** How far toward the next peg the deflection stub reaches (0–1). */
  deflectStubMax: 0.55,
};

function randomSingleDrop() {
  return dropForBucket(randomBucket(), (Math.random() * 1e9) | 0);
}

function randomConsecutiveDrops(count) {
  return Array.from({ length: count }, () => randomSingleDrop());
}

function drawReleaseOrigin(ctx2d, origin, ballIds = ['a']) {
  for (const ballId of ballIds) {
    drawOriginSpark(ctx2d, origin, ballId);
  }
}

function flickerSeedForBolt(boltIndex) {
  return flickerSeed + boltIndex * 5000;
}

async function playMultiPegCollisionBeats({
  origin,
  ballIds,
  waypointsList,
  ends,
  slices,
  pegs,
  hits,
}) {
  const { pegHitFrames, pegHitPauseMs } = STRIKE_TIMING;
  if (!hits.some(Boolean)) return;

  for (let f = 0; f < pegHitFrames; f += 1) {
    const t = (f + 1) / pegHitFrames;
    flickerSeed += 1;

    const bolts = [];
    const collisions = [];
    const activePegs = [];

    for (let i = 0; i < ballIds.length; i += 1) {
      if (!slices[i]) continue;
      const ballId = ballIds[i];
      const wp = waypointsList[i];
      const end = ends[i];
      const peg = pegs[i];
      const hit = hits[i];

      bolts.push({ waypoints: slices[i], seed: flickerSeedForBolt(i), ballId });
      if (peg) activePegs.push(peg);

      if (f === 0 && hit && wp[end]?.row != null) {
        markHotPeg(wp[end].row, wp[end].col, ballId);
      }
      if (hit) {
        const pegWp = wp[end];
        const nextWp = wp[end + 1];
        collisions.push({
          x: pegWp.x,
          y: pegWp.y,
          ballId,
          strength: t,
          from: pegWp,
          next: nextWp,
        });
      }
    }

    paintStrikeOverlay({
      origin,
      originBallIds: ballIds,
      activePegs,
      bolts,
      collisions,
    });
    await finishFrame(pegHitPauseMs);
  }
}

/** Single random bolt — twin-lightning look, full collision beats. */
async function animateSingleStrike(drop) {
  clearStrikeEffects();
  paintBoard(-1);
  const waypoints = buildWaypoints(drop.bucket, drop.path);
  const origin = waypoints[0];
  const { flickerFramesPerRow, flickerMs, rowMs, impactFrames, impactFrameMs } =
    STRIKE_TIMING;
  const maxEnd = waypoints.length - 1;
  let end = 0;

  while (end < maxEnd) {
    const endBefore = end;
    end += 1;
    const slice = waypoints.slice(0, end + 1);
    const peg = activePegAt(waypoints, end);
    const hit = end > endBefore && isPegWaypoint(waypoints[end]);

    for (let f = 0; f < flickerFramesPerRow; f += 1) {
      flickerSeed += 1;
      paintStrikeOverlay({
        origin,
        activePegs: [peg],
        bolts: [{ waypoints: slice, seed: flickerSeed, ballId: 'a' }],
      });
      await finishFrame(flickerMs);
    }
    await finishFrame(rowMs);

    await playMultiPegCollisionBeats({
      origin,
      ballIds: ['a'],
      waypointsList: [waypoints],
      ends: [end],
      slices: [slice],
      pegs: [peg],
      hits: [hit],
    });
  }

  const strike = waypoints[waypoints.length - 1];
  paintBoard(drop.bucket);
  for (let f = 0; f < impactFrames; f += 1) {
    flickerSeed += 1;
    const t = impactFrames > 1 ? f / (impactFrames - 1) : 1;
    paintStrikeOverlay({
      origin,
      bolts: [{ waypoints, seed: flickerSeed, ballId: 'a' }],
      impacts: [{ x: strike.x, y: strike.y, ballId: 'a', strength: 1 - t * 0.6 }],
    });
    await finishFrame(impactFrameMs);
  }

  paintStrikeOverlay({
    impacts: [{ x: strike.x, y: strike.y, ballId: 'a', strength: 0.4 }],
  });
}

/** Back-to-back single blue bolts with a short gap between each. */
async function animateConsecutiveStrikes(drops) {
  const { consecutiveGapMs } = STRIKE_TIMING;
  for (let i = 0; i < drops.length; i += 1) {
    await animateSingleStrike(drops[i]);
    if (i < drops.length - 1) {
      await sleep(consecutiveGapMs);
      clearStrikeEffects();
      clearFxLayer();
      paintBoard(-1);
    }
  }
}

function setButtonsDisabled(disabled) {
  strike1Btn.disabled = disabled;
  strike2Btn.disabled = disabled;
  strike3Btn.disabled = disabled;
}

async function runStrike(action) {
  if (running) return;
  running = true;
  setButtonsDisabled(true);
  try {
    await action();
  } finally {
    running = false;
    setButtonsDisabled(false);
  }
}

strike1Btn.addEventListener('click', () => {
  runStrike(async () => {
    const drop = randomSingleDrop();
    statusEl.textContent = `1 strike → bucket #${drop.bucket}…`;
    await animateSingleStrike(drop);
    statusEl.textContent = `Bucket #${drop.bucket} — ${formatMultShort(PAYTABLE[drop.bucket])}`;
  });
});

strike2Btn.addEventListener('click', () => {
  runStrike(async () => {
    const drops = randomConsecutiveDrops(2);
    statusEl.textContent =
      `2 strikes → blue #${drops[0].bucket}, then #${drops[1].bucket}…`;
    await animateConsecutiveStrikes(drops);
    statusEl.textContent =
      `#${drops[0].bucket} (${formatMultShort(PAYTABLE[drops[0].bucket])}) · ` +
      `#${drops[1].bucket} (${formatMultShort(PAYTABLE[drops[1].bucket])})`;
  });
});

strike3Btn.addEventListener('click', () => {
  runStrike(async () => {
    const drops = randomConsecutiveDrops(3);
    statusEl.textContent =
      `3 strikes → blue #${drops[0].bucket}, #${drops[1].bucket}, #${drops[2].bucket}…`;
    await animateConsecutiveStrikes(drops);
    statusEl.textContent =
      `#${drops[0].bucket} (${formatMultShort(PAYTABLE[drops[0].bucket])}) · ` +
      `#${drops[1].bucket} (${formatMultShort(PAYTABLE[drops[1].bucket])}) · ` +
      `#${drops[2].bucket} (${formatMultShort(PAYTABLE[drops[2].bucket])})`;
  });
});

window.addEventListener('resize', resize);
resize();
statusEl.textContent = '1, 2, or 3 strikes — each path random; 2/3 run back-to-back in blue.';
