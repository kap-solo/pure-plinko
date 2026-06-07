/**
 * Pure Plinko — game presentation layer.
 * Stake compliance (RGS lifecycle, jurisdiction, errors) lives in js/stake/*.
 */

import { BET_OPTIONS, DEFAULT_BET, GAME, PAYTABLE, TIMING } from './config.js';
import { apiToDisplay, displayToApi } from './money.js';
import {
  authenticate,
  buildReplayUrl,
  getReplayParams,
  getSessionID,
  isReplayMode,
  messageForRgsCode,
  parsePlinkoDrop,
  requestReplay,
  startNewRgsSession,
} from './rgs.js';
import { ensureSession, loadSession, recordPlay, resetSession, saveSession, sessionAvgReturnPercent } from './session.js';
import { formatMoney, formatMult } from './math.js';
import { ballRadii, bounceRisePx, rowDurationMs, sampleRowMotion } from './physics.js';
import { bucketCenterX, createBoardLayout, drawBall, drawBoard } from './render.js';
import { isDevMode as devFlag, getDevComplianceLabel, getJurisdictionProfileName } from './stake/config.js';
import { createJurisdictionController } from './stake/jurisdiction.js';
import { createStakeLifecycle } from './stake/lifecycle.js';
import { bootstrapPlayMode, attachBalanceRefresh } from './stake/bootstrap.js';
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const balanceEl = document.getElementById('balance');
const betEl = document.getElementById('bet-display');
const resultEl = document.getElementById('last-result');
const messageEl = document.getElementById('message');
const dropBtn = document.getElementById('drop-btn');
const autoplayBtn = document.getElementById('autoplay-btn');
const newSessionBtn = document.getElementById('new-session-btn');
const copyReplayBtn = document.getElementById('copy-replay-btn');
const replayBanner = document.getElementById('replay-banner');
const playControls = document.getElementById('play-controls');
const replayControls = document.getElementById('replay-controls');
const replayAgainBtn = document.getElementById('replay-again-btn');
const balanceHud = document.getElementById('balance-hud');
const statsEl = document.getElementById('stats');
const complianceDevEl = document.getElementById('compliance-dev');
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
let animationSpeed = 1;
let layout = createBoardLayout(canvas, GAME.rows);
const replayMode = isReplayMode();
/** @type {object | null} */
let replayRound = null;
let lastReplayUrl = '';
const devMode = devFlag();

const jurisdictionCtrl = createJurisdictionController(() => {
  syncDevTools();
  syncControls();
  syncHud();
});

const lifecycle = createStakeLifecycle({
  jurisdiction: jurisdictionCtrl,
  performRoundVisual: async (round) => {
    const drop = parsePlinkoDrop(round);
    await animateDrop(drop.bucket, drop.path);
  },
  showStaticResult: (round) => {
    const drop = parsePlinkoDrop(round);
    drawBoard(ctx, layout, PAYTABLE, drop.bucket);
  },
  applyBalance: (balanceObj) => {
    balance = apiToDisplay(balanceObj.amount);
  },
  onRoundSettled: (round, result, { recordSession }) => {
    const payout = apiToDisplay(result.payoutApi);
    const betDisplay = apiToDisplay(round.amount);
    bet = betDisplay;
    syncHud();

    if (recordSession) {
      session = ensureSession(session);
      recordPlay(session, { bet: betDisplay, payout, multiplier: result.multiplier });
      saveSession(session);
      syncSessionHud();
    }

    const replayEvent = result.replayEvent || `${getSessionID()}-${round.roundID}`;
    lastReplayUrl = buildReplayUrl({
      event: replayEvent,
      amountApi: round.amount,
      mode: 'base',
    });
    copyReplayBtn.hidden = false;
    syncControls();

    displayRoundResult({
      bucket: result.bucket,
      multiplier: result.multiplier,
      payout,
      profit: payout - betDisplay,
    });
  },
  setMessage,
  getBetApi: () => displayToApi(bet),
  setBetFromApi: (amountApi) => {
    bet = apiToDisplay(amountApi);
  },
});

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

function applyAuthConfig(data) {
  if (data.balance) {
    balance = apiToDisplay(data.balance.amount);
  }
  if (data.config?.betLevels?.length) {
    betOptions = data.config.betLevels.map(apiToDisplay);
    bet = apiToDisplay(data.config.defaultBetLevel ?? displayToApi(DEFAULT_BET));
    if (!betOptions.includes(bet)) {
      bet = betOptions[0];
    }
    renderBetChips();
  }
  if (data.config?.jurisdiction) {
    jurisdictionCtrl.mergeFromServer(data.config.jurisdiction);
  }
  if (devMode) {
    jurisdictionCtrl.applyDevProfile(getJurisdictionProfileName());
  }
}

function syncDevTools() {
  if (replayMode) return;
  autoplayBtn.hidden = !jurisdictionCtrl.autoplayAllowed;
  newSessionBtn.hidden = false;
  if (complianceDevEl) {
    complianceDevEl.hidden = !devMode;
    if (devMode) {
      complianceDevEl.textContent = `Compliance dev · ${getDevComplianceLabel()}`;
    }
  }
}

function syncSessionHud() {
  if (!session || !jurisdictionCtrl.showNetPosition) {
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

function setPlayModeUi() {
  replayBanner.hidden = true;
  playControls.hidden = false;
  replayControls.hidden = true;
  balanceHud.hidden = false;
}

function setReplayModeUi() {
  replayBanner.hidden = false;
  playControls.hidden = true;
  replayControls.hidden = false;
  balanceHud.hidden = true;
  sessionPanel.hidden = true;
  copyReplayBtn.hidden = true;
}

function syncHud() {
  balanceEl.textContent = replayMode ? '—' : formatMoney(balance);
  betEl.textContent = formatMoney(bet);
  const risePx = bounceRisePx(layout, TIMING.bouncePop).toFixed(0);
  const rtpPart = jurisdictionCtrl.showRtp ? ` · RTP ${GAME.targetRtpPercent}%` : '';
  statsEl.textContent = `${GAME.rows} rows · max ${formatMult(GAME.maxWinMult)} · bounce ${risePx}px${rtpPart}`;
  syncSessionHud();
}

function setMessage(text) {
  messageEl.textContent = text;
}

function displayRoundResult({ bucket, multiplier, payout, profit }) {
  resultEl.textContent = `${formatMult(multiplier)} → ${formatMoney(payout)}`;
  if (multiplier >= 1000) {
    setMessage(`Jackpot bucket #${bucket} — ${formatMult(multiplier)} on ${formatMoney(bet)}.`);
  } else if (profit > 0) {
    setMessage(`Bucket #${bucket} — won ${formatMoney(profit)}.`);
  } else if (payout === bet) {
    setMessage(`Bucket #${bucket} — push, stake returned.`);
  } else {
    setMessage(`Bucket #${bucket} — ${formatMult(multiplier)} return.`);
  }
}

function displayApiRoundResult(result) {
  if (!result) return;
  displayRoundResult({
    bucket: result.bucket,
    multiplier: result.multiplier,
    payout: apiToDisplay(result.payoutApi),
    profit: apiToDisplay(result.profitApi),
  });
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
  if (replayMode) {
    replayAgainBtn.disabled = dropping || !replayRound;
    return;
  }

  const busy = dropping || autoplaying;
  autoplayBtn.disabled = busy || !rgsReady || !jurisdictionCtrl.autoplayAllowed;
  newSessionBtn.disabled = busy;
  copyReplayBtn.disabled = busy || !lastReplayUrl;

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
    if (jurisdictionCtrl.turboAllowed) {
      dropBtn.textContent = 'Fast';
      dropBtn.classList.add('fast');
      dropBtn.disabled = false;
    } else {
      dropBtn.textContent = 'Drop';
      dropBtn.classList.remove('fast');
      dropBtn.disabled = true;
    }
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

async function withDropLock(fn) {
  dropping = true;
  animationSpeed = 1;
  syncControls();
  try {
    return await fn();
  } finally {
    dropping = false;
    animationSpeed = 1;
    syncControls();
  }
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

  await withDropLock(async () => {
    try {
      await lifecycle.executeDrop({ animate: true });
    } catch (err) {
      console.error(err);
      const code = String(err.message);
      if (code === 'ERR_BE') {
        try {
          const data = await authenticate();
          applyAuthConfig(data);
          if (data.round?.active && data.round.state?.length) {
            await lifecycle.resumeRound(data.round, { lastEvent: data.meta?.lastEvent });
            return;
          }
        } catch (resumeErr) {
          console.error(resumeErr);
        }
      }
      setMessage(messageForRgsCode(code));
    }
  });
}

async function onAutoplay100() {
  if (dropping || autoplaying || !jurisdictionCtrl.autoplayAllowed) return;
  if (!rgsReady || balance < bet) return;

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
      await lifecycle.executeDrop({ animate: false });
      played += 1;
      await sleep(0);
    }
    if (played === 100) {
      setMessage('Autoplay complete — 100 plays.');
    }
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message)));
  } finally {
    autoplaying = false;
    syncControls();
  }
}

dropBtn.addEventListener('click', () => {
  if (dropping && jurisdictionCtrl.turboAllowed) {
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
    lastReplayUrl = '';
    copyReplayBtn.hidden = true;
    syncSessionHud();
    setMessage('Starting new session…');

    const data = await authenticate();
    applyAuthConfig(data);
    rgsReady = true;
    syncHud();
    const authOutcome = await lifecycle.handleAuthRound(data.round, {
      lastEvent: data.meta?.lastEvent,
    });
    if (authOutcome.status === 'ready') {
      setMessage(`New session — balance ${formatMoney(balance)}.`);
    }
  } catch (err) {
    console.error(err);
    rgsReady = false;
    setMessage(messageForRgsCode(String(err.message)));
  } finally {
    syncControls();
  }
}

async function onCopyReplayLink() {
  if (!lastReplayUrl) return;
  try {
    await navigator.clipboard.writeText(lastReplayUrl);
    setMessage('Replay link copied.');
  } catch {
    setMessage('Could not copy — paste the URL from the address bar.');
  }
}

async function playReplayAnimation(round, { showIntro = true } = {}) {
  const drop = parsePlinkoDrop(round);
  const multiplier = round.payoutMultiplier ?? (round.payout / Math.max(1, round.amount));
  bet = apiToDisplay(round.amount);
  const payout = apiToDisplay(round.payout);
  syncHud();

  dropping = true;
  animationSpeed = 1;
  syncControls();
  try {
    if (showIntro) setMessage('Replaying round…');
    await animateDrop(drop.bucket, drop.path);
    displayRoundResult({
      bucket: drop.bucket,
      multiplier,
      payout,
      profit: payout - bet,
    });
    setMessage(`Replay — bucket #${drop.bucket}, ${formatMult(multiplier)} on ${formatMoney(bet)}.`);
  } finally {
    dropping = false;
    syncControls();
  }
}

async function bootstrapReplay() {
  setReplayModeUi();
  const params = getReplayParams();
  if (!params.event) {
    setMessage('Replay URL missing event parameter.');
    return;
  }
  setMessage('Loading replay…');
  try {
    const data = await requestReplay({
      game: params.game,
      version: params.version,
      mode: params.mode,
      event: params.event,
      amountApi: params.amountApi,
    });
    replayRound = data.round;
    rgsReady = true;
    syncControls();
    syncHud();
    await playReplayAnimation(replayRound);
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message)));
  }
}

function handleAuthRoundOutcome(authOutcome) {
  if (authOutcome.status === 'resumed') {
    setMessage('Round resumed.');
  } else if (authOutcome.status === 'completed') {
    displayApiRoundResult(authOutcome.result);
    setMessage('Last completed round restored.');
  }
}

autoplayBtn.addEventListener('click', onAutoplay100);
newSessionBtn.addEventListener('click', onNewSession);
copyReplayBtn.addEventListener('click', onCopyReplayLink);
replayAgainBtn.addEventListener('click', () => {
  if (replayRound && !dropping) playReplayAnimation(replayRound, { showIntro: false });
});
window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
  if (replayMode || !jurisdictionCtrl.spacebarAllowed || dropping || autoplaying || !rgsReady) return;
  if (e.code !== 'Space' || e.repeat) return;
  e.preventDefault();
  onDrop();
});

attachBalanceRefresh({
  get rgsReady() {
    return rgsReady;
  },
  isBusy: () => dropping || autoplaying,
  applyBalance: (balanceObj) => {
    balance = apiToDisplay(balanceObj.amount);
  },
  syncHud,
});

renderBetChips();
resizeCanvas();
setPlayModeUi();
syncDevTools();
syncHud();
syncControls();

if (replayMode) {
  bootstrapReplay();
} else {
  bootstrapPlayMode({
    applyAuthConfig,
    lifecycle,
    setMessage,
    setRgsReady: (ready) => {
      rgsReady = ready;
      syncControls();
    },
    onReady: () => syncHud(),
    onAuthRound: handleAuthRoundOutcome,
  });
}
