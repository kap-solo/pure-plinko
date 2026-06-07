import {
  BET_OPTIONS,
  DEFAULT_BET,
  GAME,
  PAYTABLE,
  TIMING,
} from './config.js';
import { apiToDisplay, displayToApi } from './money.js';
import {
  authenticate,
  endRound,
  parsePlinkoDrop,
  play,
  roundPayoutMultiplier,
  startNewRgsSession,
} from './rgs.js';
import {
  ensureSession,
  loadSession,
  recordPlay,
  resetSession,
  saveSession,
  sessionAvgReturnPercent,
} from './session.js';
import { formatMoney, formatMult } from './math.js';
import { ballRadii, bounceRisePx, rowDurationMs, sampleRowMotion } from './physics.js';
import {
  bucketCenterX,
  createBoardLayout,
  drawBall,
  drawBoard,
} from './render.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const balanceEl = document.getElementById('balance');
const betEl = document.getElementById('bet-display');
const resultEl = document.getElementById('last-result');
const messageEl = document.getElementById('message');
const dropBtn = document.getElementById('drop-btn');
const autoplayBtn = document.getElementById('autoplay-btn');
const newSessionBtn = document.getElementById('new-session-btn');
const statsEl = document.getElementById('stats');
const betChips = document.getElementById('bet-chips');
const sessionPanel = document.getElementById('session-panel');
const sessionPlaysEl = document.getElementById('session-plays');
const sessionPlEl = document.getElementById('session-pl');
const sessionBestEl = document.getElementById('session-best');
const sessionAvgReturnEl = document.getElementById('session-avg-return');

/** @type {object | null} */
let session = loadSession();

let balance = 0;
let bet = DEFAULT_BET;
/** @type {number[]} */
let betOptions = [...BET_OPTIONS];
let rgsReady = false;
let dropping = false;
let autoplaying = false;
/** 1 = normal; 3 = FAST clicked mid-drop. */
let animationSpeed = 1;
let layout = createBoardLayout(canvas, GAME.rows);

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(rect.width, 520);
  canvas.width = size;
  canvas.height = size * 1.35;
  layout = createBoardLayout(canvas, GAME.rows);
  drawBoard(ctx, layout, PAYTABLE);
}

function formatSignedMoney(amount) {
  const abs = formatMoney(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `-${abs}`;
  return formatMoney(0);
}

function applyBalance(balanceObj) {
  balance = apiToDisplay(balanceObj.amount);
}

function syncSessionHud() {
  if (!session) {
    sessionPanel.hidden = true;
    return;
  }
  sessionPanel.hidden = false;
  sessionPlaysEl.textContent = String(session.plays);
  sessionPlEl.textContent = formatSignedMoney(session.netProfit);
  sessionPlEl.classList.toggle('positive', session.netProfit > 0);
  sessionPlEl.classList.toggle('negative', session.netProfit < 0);
  sessionBestEl.textContent =
    session.highestWin > 0
      ? `${formatMult(session.highestMultiplier)} (${formatMoney(session.highestWin)})`
      : '—';
  sessionAvgReturnEl.textContent = `${sessionAvgReturnPercent(session).toFixed(2)}%`;
}

function syncHud() {
  balanceEl.textContent = formatMoney(balance);
  betEl.textContent = formatMoney(bet);
  const risePx = bounceRisePx(layout, TIMING.bouncePop).toFixed(0);
  statsEl.textContent = `${GAME.rows} rows · max ${formatMult(GAME.maxWinMult)} · bounce ${risePx}px · RTP ${GAME.targetRtpPercent}%`;
  syncSessionHud();
}

function setMessage(text) {
  messageEl.textContent = text;
}

function renderBetChips() {
  betChips.innerHTML = '';
  for (const amount of betOptions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip${amount === bet ? ' active' : ''}`;
    btn.textContent = formatMoney(amount);
    btn.addEventListener('click', () => {
      if (dropping || autoplaying) return;
      bet = amount;
      renderBetChips();
      syncHud();
    });
    betChips.appendChild(btn);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scaledSleep(ms) {
  return sleep(Math.max(4, Math.round(ms / animationSpeed)));
}

function syncControls() {
  const busy = dropping || autoplaying;
  autoplayBtn.disabled = busy || !rgsReady;
  newSessionBtn.disabled = busy;

  for (const chip of betChips.querySelectorAll('button')) {
    chip.disabled = busy;
  }

  if (autoplaying || !rgsReady) {
    dropBtn.textContent = 'Drop';
    dropBtn.classList.remove('fast');
    dropBtn.disabled = true;
    return;
  }

  if (dropping) {
    dropBtn.textContent = 'Fast';
    dropBtn.classList.add('fast');
    dropBtn.disabled = false;
    return;
  }

  dropBtn.textContent = 'Drop';
  dropBtn.classList.remove('fast');
  dropBtn.disabled = false;
}

async function animateDrop(bucket, path) {
  const { ballRadius, physicsRadius } = ballRadii(layout);
  let slot = GAME.rows / 2;
  const dropY = layout.padTop + layout.rowGap * 0.35;
  for (let row = 0; row < GAME.rows; row += 1) {
    const fromSlot = slot;
    slot += path[row] * 0.5;
    const rowMs = rowDurationMs(row, GAME.rows, TIMING.startRowMs, TIMING.endRowMs);
    const frameMs = Math.max(8, Math.round(rowMs / TIMING.framesPerRow));

    for (let frame = 1; frame <= TIMING.framesPerRow; frame += 1) {
      const t = frame / TIMING.framesPerRow;
      const { x, y, peg } = sampleRowMotion({
        layout,
        row,
        fromSlot,
        toSlot: slot,
        t,
        dropY,
        ballRadius,
        physicsRadius,
        bouncePop: TIMING.bouncePop,
      });
      drawBoard(ctx, layout, PAYTABLE, -1, peg);
      drawBall(ctx, x, y, ballRadius);
      await scaledSleep(frameMs);
    }
  }

  const targetX = bucketCenterX(layout, bucket);
  const targetY = layout.bucketY + 8;
  const lastY = layout.padTop + layout.rowGap * (GAME.rows + 0.55);
  const lastRowMs = rowDurationMs(GAME.rows - 1, GAME.rows, TIMING.startRowMs, TIMING.endRowMs);
  const settleFrames = TIMING.framesPerRow;
  const settleFrameMs = Math.max(
    8,
    Math.round((lastRowMs * TIMING.settleDurationFactor) / settleFrames),
  );
  for (let frame = 1; frame <= settleFrames; frame += 1) {
    const t = frame / settleFrames;
    const fall = 1 - (1 - t) ** 2.6;
    const y = lastY + (targetY - lastY) * fall;
    drawBoard(ctx, layout, PAYTABLE, bucket);
    drawBall(ctx, targetX, y, ballRadius);
    await scaledSleep(settleFrameMs);
  }
}

function setResultMessage(result, payout, profit) {
  resultEl.textContent = `${formatMult(result.multiplier)} → ${formatMoney(payout)}`;
  if (result.multiplier >= 1000) {
    setMessage(`Jackpot bucket #${result.bucket} — ${formatMult(result.multiplier)} on ${formatMoney(bet)}.`);
  } else if (profit > 0) {
    setMessage(`Bucket #${result.bucket} — won ${formatMoney(profit)}.`);
  } else if (payout === bet) {
    setMessage(`Bucket #${result.bucket} — push, stake returned.`);
  } else {
    setMessage(`Bucket #${result.bucket} — ${formatMult(result.multiplier)} return.`);
  }
}

/** @param {{ animate?: boolean }} [options] */
async function executeDrop({ animate = true } = {}) {
  const amountApi = displayToApi(bet);
  const playRes = await play({ amountApi, mode: 'BASE' });
  applyBalance(playRes.balance);

  const round = playRes.round;
  const drop = parsePlinkoDrop(round);
  const multiplier = roundPayoutMultiplier(round);

  if (animate) {
    setMessage('Dropping…');
    await animateDrop(drop.bucket, drop.path);
  } else {
    drawBoard(ctx, layout, PAYTABLE, drop.bucket);
  }

  const endRes = await endRound();
  applyBalance(endRes.balance);

  const payout = apiToDisplay(round.payout);
  syncHud();

  session = ensureSession(session);
  recordPlay(session, { bet, payout, multiplier });
  saveSession(session);
  syncSessionHud();

  return {
    bucket: drop.bucket,
    multiplier,
    payout,
    profit: payout - bet,
  };
}

async function onDrop() {
  if (dropping || autoplaying) return;
  if (!rgsReady) {
    setMessage('Connecting to RGS…');
    return;
  }
  if (balance < bet) {
    setMessage('Not enough balance.');
    return;
  }

  dropping = true;
  animationSpeed = 1;
  syncControls();

  try {
    const result = await executeDrop({ animate: true });
    setResultMessage(result, result.payout, result.profit);
  } catch (err) {
    console.error(err);
    if (String(err.message) === 'ERR_IPB') {
      setMessage('Not enough balance.');
    } else {
      setMessage(`Play failed — ${err.message}`);
    }
  } finally {
    dropping = false;
    animationSpeed = 1;
    syncControls();
  }
}

async function onAutoplay100() {
  if (dropping || autoplaying) return;
  if (!rgsReady) {
    setMessage('Connecting to RGS…');
    return;
  }
  if (balance < bet) {
    setMessage('Not enough balance.');
    return;
  }

  autoplaying = true;
  syncControls();

  let played = 0;
  try {
    for (let i = 0; i < 100; i += 1) {
      if (balance < bet) {
        setMessage(`Autoplay stopped — insufficient balance after ${played} plays.`);
        break;
      }
      setMessage(`Autoplay ${i + 1}/100…`);
      const result = await executeDrop({ animate: false });
      if (i === 99) {
        setResultMessage(result, result.payout, result.profit);
      }
      played += 1;
      await sleep(0);
    }
    if (played === 100) {
      setMessage('Autoplay complete — 100 plays.');
    }
  } catch (err) {
    console.error(err);
    setMessage(`Autoplay failed — ${err.message}`);
  } finally {
    autoplaying = false;
    syncControls();
  }
}

dropBtn.addEventListener('click', () => {
  if (dropping) {
    animationSpeed = 3;
    dropBtn.disabled = true;
    return;
  }
  onDrop();
});

async function onNewSession() {
  if (dropping || autoplaying) return;

  newSessionBtn.disabled = true;
  try {
    startNewRgsSession();
    session = resetSession();
    resultEl.textContent = '—';
    syncSessionHud();
    setMessage('Starting new session…');

    const data = await authenticate();
    applyBalance(data.balance);
    if (data.config?.betLevels?.length) {
      betOptions = data.config.betLevels.map(apiToDisplay);
      bet = apiToDisplay(data.config.defaultBetLevel ?? displayToApi(DEFAULT_BET));
      if (!betOptions.includes(bet)) {
        bet = betOptions[0];
      }
      renderBetChips();
    }
    rgsReady = true;
    syncHud();
    setMessage(`New session — balance ${formatMoney(balance)}.`);
  } catch (err) {
    console.error(err);
    rgsReady = false;
    setMessage(`New session failed — ${err.message}`);
  } finally {
    syncControls();
  }
}

autoplayBtn.addEventListener('click', onAutoplay100);
newSessionBtn.addEventListener('click', onNewSession);
window.addEventListener('resize', resizeCanvas);

renderBetChips();
resizeCanvas();
syncHud();
setMessage('Connecting to RGS…');
syncControls();

authenticate()
  .then((data) => {
    applyBalance(data.balance);
    if (data.config?.betLevels?.length) {
      betOptions = data.config.betLevels.map(apiToDisplay);
      bet = apiToDisplay(data.config.defaultBetLevel ?? displayToApi(DEFAULT_BET));
      if (!betOptions.includes(bet)) {
        bet = betOptions[0];
      }
      renderBetChips();
    }
    rgsReady = true;
    syncControls();
    syncHud();
    setMessage('Set bet · press Drop.');
  })
  .catch((err) => {
    console.error(err);
    setMessage('RGS unavailable — run: node server.mjs');
  });
