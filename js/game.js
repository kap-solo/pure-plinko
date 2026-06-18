/**
 * Pure Plinko — game presentation layer.
 * Stake compliance runs on Suki Engine (@kap-solo/suki-engine).
 */

import { apiToDisplay, displayToApi } from '@kap-solo/suki-engine/client/money.js';
import {
  authenticate,
  buildReplayUrl,
  classifyRgsError,
  createAudioPrefs,
  createBetUi,
  createGameBootstrap,
  createGameMenu,
  createGamePreloader,
  createModalHost,
  createRecentResultsStore,
  formatReplayStartSummary,
  getReplayParams,
  getSessionID,
  isReplayMode,
  messageForRgsCode,
  requestReplay,
  roundPayoutMultiplier,
  startNewRgsSession,
} from '@kap-solo/suki-engine/client/rgs.js';
import { BET_OPTIONS, DEFAULT_BET, GAME, PAYTABLE, TIMING } from './config.js';
import { registerPlinkoModals } from './menu.js';
import { buildPlinkoSettledResult, parsePlinkoDrop } from './plinko/round.js';
import { ensureSession, loadSession, recordPlay, resetSession, saveSession, sessionAvgReturnPercent } from './session.js';
import { formatMult } from './math.js';
import { ballRadii, bounceRisePx, rowDurationMs, sampleRowMotion } from './physics.js';
import { bucketCenterX, createBoardLayout, drawBall, drawBoard } from './render.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const balanceEl = document.getElementById('balance');
const betEl = document.getElementById('bet-display');
const resultEl = document.getElementById('last-result');
const messageEl = document.getElementById('message');
const replayBanner = document.getElementById('replay-banner');
const balanceHud = document.getElementById('balance-hud');
const statsEl = document.getElementById('stats');
const complianceDevEl = document.getElementById('compliance-dev');
const sessionTimerStat = document.getElementById('session-timer-stat');
const sessionTimerEl = document.getElementById('session-timer');
const principlesAside = document.querySelector('.principles');

const shellEl = document.querySelector('.suki-stake-shell');
const brandEl = document.querySelector('.suki-brand');
const modalHost = createModalHost({ root: shellEl });
const audioPrefs = createAudioPrefs({ storageKey: 'pure-plinko.audio' });
const recentResults = createRecentResultsStore({ max: 25 });
const gameMenu = createGameMenu({
  brand: brandEl,
  shell: shellEl,
  modalHost,
  audioPrefs,
});

const betUi = createBetUi({
  root: document.getElementById('bet-ui-root'),
  showModeRow: false,
});
const sessionPanel = document.getElementById('session-panel');
const sessionPlaysEl = document.getElementById('session-plays');
const sessionPlEl = document.getElementById('session-pl');
const sessionBestEl = document.getElementById('session-best');
const sessionAvgReturnEl = document.getElementById('session-avg-return');
const balanceLabelEl = document.getElementById('balance-label');
const betLabelEl = document.getElementById('bet-label');
const lastResultLabelEl = document.getElementById('last-result-label');
const sessionPlaysLabelEl = document.getElementById('session-plays-label');
const sessionPlLabelEl = document.getElementById('session-pl-label');
const replayNoteEl = document.getElementById('replay-note');

/** @type {object | null} */
let session = loadSession();

let balance = 0;
let bet = DEFAULT_BET;
/** @type {number[]} */
let betOptions = [...BET_OPTIONS];
let dropping = false;
let autoplaying = false;
let animationSpeed = 1;
let layout = createBoardLayout(canvas, GAME.rows);
const replayMode = isReplayMode();
/** @type {object | null} */
let replayRound = null;
let lastReplayUrl = '';

function setMessage(text) {
  messageEl.textContent = text;
}

const game = createGameBootstrap({
  suki: {
    gameId: 'pure-plinko',
    replayVersion: '1',
    sessionStorageKey: 'purePlinko.rgsSessionID',
  },
  shell: {
    elements: {
      complianceDev: complianceDevEl,
      testControls: betUi.elements.testControls,
      copyReplay: betUi.elements.copyReplay,
      autoplay: betUi.elements.autoplay,
      newSession: betUi.elements.newSession,
      devAside: principlesAside,
      sessionTimer: sessionTimerEl,
      sessionTimerContainer: sessionTimerStat,
      balanceLabel: balanceLabelEl,
      betLabel: betLabelEl,
      lastResultLabel: lastResultLabelEl,
      sessionPlaysLabel: sessionPlaysLabelEl,
      sessionPlLabel: sessionPlLabelEl,
      replayNote: replayNoteEl,
      dropButton: betUi.elements.dropButton,
    },
    screenPreview: { root: shellEl },
  },
  lifecycle: {
    handlers: {
      plinkoDrop: async (event, { animate }) => {
        if (animate) {
          await animateDrop(event.bucket, event.path);
        } else {
          drawBoard(ctx, layout, PAYTABLE, event.bucket);
        }
      },
      setTotalWin: async () => {},
      finalWin: async () => {},
    },
    onResumeStatic: (round) => {
      const drop = parsePlinkoDrop(round);
      drawBoard(ctx, layout, PAYTABLE, drop.bucket);
    },
    onStaticRound: (round) => {
      const drop = parsePlinkoDrop(round);
      drawBoard(ctx, layout, PAYTABLE, drop.bucket);
    },
    applyBalance: (balanceObj) => {
      balance = apiToDisplay(balanceObj.amount);
    },
    buildSettledResult: buildPlinkoSettledResult,
    playingMessage: 'Dropping…',
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
        mode: game.betModes.replayModeKey(),
        lang: game.copy.lang,
      });
      betUi.setLastReplayUrl(lastReplayUrl);
      syncControls();

      recentResults.push({
        data: {
          bucket: result.bucket,
          multiplier: result.multiplier,
          payout,
        },
      });

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
  },
  auth: {
    defaultBetDisplay: DEFAULT_BET,
    gameModes: [{ name: 'base', cost: 1 }],
    onConfigured(auth) {
      if (auth.balanceDisplay != null) {
        balance = auth.balanceDisplay;
      }
      if (auth.betLevelsDisplay.length) {
        betOptions = auth.betLevelsDisplay;
        bet = auth.defaultBetDisplay ?? betOptions[0];
        betUi.setBetLevels(auth.betLevelsDisplay, bet);
      }
    },
  },
  ui: {
    setMessage,
    syncHud,
    isBusy: () => dropping || autoplaying,
    onRgsReady: () => syncControls(),
    onReady: () => {
      syncHud();
      setMessage(copyTerm('setBetPrompt'));
    },
    onAuthRound: handleAuthRoundOutcome,
  },
  onJurisdictionChange: () => {
    gameMenu.refresh();
    syncControls();
    syncHud();
  },
  replay: { start: bootstrapReplay },
});

const { controls, lifecycle, applyAuthConfig, syncDevTools } = game;

gameMenu.bind({ game });
registerPlinkoModals({
  modalHost,
  recentResults,
  game,
  formatCurrency: (amount) => game.formatCurrency(amount),
  getSession: () => session,
});

betUi.bind({
  game,
  replayMode,
  turboDisablesButton: true,
  getBet: () => bet,
  setBet: (value) => {
    bet = value;
  },
  getBetOptions: () => betOptions,
  setBetOptions: (levels) => {
    betOptions = levels;
  },
  getBusy: () => dropping || autoplaying,
  getPlaying: () => dropping,
  getAutoplaying: () => autoplaying,
  getPlayLabel: () => copyTerm('drop'),
  onBetChange: syncHud,
  onDismissOverlays: () => {
    gameMenu.close();
    modalHost.close();
  },
  onPlay: onDrop,
  onTurbo: () => {
    animationSpeed = 3;
  },
  onAutoplay: onAutoplay100,
  onNewSession: onNewSession,
  onCopyReplay: onCopyReplayLink,
  onReplayAgain: () => {
    if (replayRound && !dropping) playReplayAnimation(replayRound, { showIntro: false });
  },
});

function fmt(amount) {
  return game.formatCurrency(amount);
}

function copyTerm(key) {
  return game.copy.term(key);
}

const BOARD_ASPECT = 1 / 1.35;

function resizeCanvas() {
  const stage = canvas.parentElement;
  if (!stage) return;

  const rect = stage.getBoundingClientRect();
  const pad = 8;
  const maxW = Math.max(1, rect.width - pad);
  const maxH = Math.max(1, rect.height - pad);

  let width = maxW;
  let height = width / BOARD_ASPECT;
  if (height > maxH) {
    height = maxH;
    width = height * BOARD_ASPECT;
  }

  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  layout = createBoardLayout(canvas, GAME.rows);
  drawBoard(ctx, layout, PAYTABLE);
}

function formatSignedMoney(amount) {
  const abs = fmt(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `-${abs}`;
  return fmt(0);
}

function syncSessionHud() {
  if (!session || !controls.showNetPosition) {
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
      ? `${formatMult(session.highestMultiplier)} (${fmt(session.highestWin)})`
      : '—';
  sessionAvgReturnEl.textContent = `${sessionAvgReturnPercent(session).toFixed(2)}%`;
}

function setPlayModeUi() {
  replayBanner.hidden = true;
  betUi.setView('play');
  balanceHud.hidden = false;
}

function setReplayModeUi() {
  replayBanner.hidden = false;
  betUi.setView('replay');
  balanceHud.hidden = true;
  sessionPanel.hidden = true;
  betUi.setLastReplayUrl('');
}

function syncHud() {
  balanceEl.textContent = replayMode ? '—' : fmt(balance);
  betEl.textContent = fmt(bet);
  const risePx = bounceRisePx(layout, TIMING.bouncePop).toFixed(0);
  const rtpPart = controls.showRtp ? ` · RTP ${GAME.targetRtpPercent}%` : '';
  statsEl.textContent = `${GAME.rows} rows · max ${formatMult(GAME.maxWinMult)} · bounce ${risePx}px${rtpPart}`;
  syncSessionHud();
}

function displayRoundResult({ bucket, multiplier, payout, profit }) {
  resultEl.textContent = `${formatMult(multiplier)} → ${fmt(payout)}`;
  if (multiplier >= 1000) {
    setMessage(`Jackpot bucket #${bucket} — ${formatMult(multiplier)} ${copyTerm('onAmount')} ${fmt(bet)}.`);
  } else if (profit > 0) {
    setMessage(`Bucket #${bucket} — ${copyTerm('won')} ${fmt(profit)}.`);
  } else if (payout === bet) {
    setMessage(`Bucket #${bucket} — ${copyTerm('stakeReturned')}.`);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scaledSleep(ms) {
  return sleep(Math.max(4, Math.round(ms / animationSpeed)));
}

function syncControls() {
  betUi.sync();
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

function playCostDisplay() {
  const baseApi = displayToApi(bet);
  const playApi = game.betModes.playAmountApi(baseApi);
  return apiToDisplay(playApi);
}

async function onDrop() {
  if (dropping || autoplaying) return;
  if (!game.rgsReady) {
    setMessage(copyTerm('connectingRgs'));
    return;
  }
  if (balance < playCostDisplay()) {
    setMessage(copyTerm('insufficientBalance'));
    return;
  }

  await withDropLock(async () => {
    try {
      await lifecycle.executeDrop({ animate: true });
    } catch (err) {
      console.error(err);
      const policy = classifyRgsError(String(err.message), { copy: game.copy });
      if (policy.shouldResumeRound) {
        try {
          const data = await authenticate();
          applyAuthConfig(data);
          if (data.round?.active && data.round.state?.length) {
            await lifecycle.resumeRound(data.round, { meta: data.meta });
            return;
          }
        } catch (resumeErr) {
          console.error(resumeErr);
        }
      }
      setMessage(policy.message);
    }
  });
}

async function onAutoplay100() {
  if (dropping || autoplaying || !controls.canAutoplay) return;
  if (!game.rgsReady || balance < playCostDisplay()) return;

  autoplaying = true;
  syncControls();
  let played = 0;
  try {
    for (let i = 0; i < 100; i += 1) {
      if (balance < playCostDisplay()) {
        setMessage(`${copyTerm('autoplayStopped')} ${played} plays.`);
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
    setMessage(messageForRgsCode(String(err.message), { copy: game.copy }));
  } finally {
    autoplaying = false;
    syncControls();
  }
}

async function onNewSession() {
  if (dropping || autoplaying) return;
  betUi.elements.newSession.disabled = true;
  try {
    startNewRgsSession();
    game.sessionTimer?.reset();
    session = resetSession();
    resultEl.textContent = '—';
    lastReplayUrl = '';
    betUi.setLastReplayUrl('');
    syncSessionHud();
    setMessage('Starting new session…');

    const data = await authenticate();
    applyAuthConfig(data);
    game.setRgsReady(true);
    syncHud();
    const authOutcome = await lifecycle.handleAuthRound(data.round, {
      lastEvent: data.meta?.lastEvent,
    });
    if (authOutcome.status === 'ready') {
      setMessage(`${copyTerm('newSessionBalance')} ${fmt(balance)}.`);
    }
  } catch (err) {
    console.error(err);
    game.setRgsReady(false);
    setMessage(messageForRgsCode(String(err.message), { copy: game.copy }));
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
  const multiplier = roundPayoutMultiplier(round);
  bet = apiToDisplay(round.amount);
  const payout = apiToDisplay(round.payout);
  syncHud();

  dropping = true;
  animationSpeed = 1;
  syncControls();
  try {
    if (showIntro) {
      setMessage(
        formatReplayStartSummary(
          game.copy,
          { playAmount: bet, payoutMultiplier: multiplier, finalAmount: payout },
          { formatCurrency: fmt, formatMult },
        ),
      );
      await sleep(1200);
    }
    await animateDrop(drop.bucket, drop.path);
    displayRoundResult({
      bucket: drop.bucket,
      multiplier,
      payout,
      profit: payout - bet,
    });
    setMessage(copyTerm('replayingRound'));
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
  setMessage(copyTerm('loadingReplay'));
  try {
    const data = await requestReplay({
      game: params.game,
      version: params.version,
      mode: params.mode,
      event: params.event,
      amountApi: params.amountApi,
    });
    replayRound = data.round;
    game.setRgsReady(true);
    syncControls();
    syncHud();
    await playReplayAnimation(replayRound);
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message), { copy: game.copy }));
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

window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
  if (replayMode || !controls.canSpacebar || dropping || autoplaying || !game.rgsReady) return;
  if (e.code !== 'Space' || e.repeat) return;
  e.preventDefault();
  onDrop();
});

betUi.renderBetLevels();
resizeCanvas();
syncDevTools();
syncHud();
syncControls();

if (replayMode) {
  setReplayModeUi();
  game.start();
} else {
  setPlayModeUi();
  createGamePreloader({
    shell: shellEl,
    brand: 'SUKI engine',
    subtitle: GAME.title,
    hint: 'Tap anywhere to play',
    connectingHint: copyTerm('connectingRgs'),
    assets: [],
    gate: () => game.checkRgsGate(),
    bootstrap: () => game.start(),
    onContinue: () => {},
  });
}
