/**
 * Stake round lifecycle — outcome from RGS, animation is performance only.
 * play → perform round.state → bet/event → end-round
 */

import { endRound, play, reportBetEvent } from '../rgs.js';
import { parsePlinkoDrop, roundPayoutMultiplier } from '../rgs.js';
import { messageForRgsCode } from './errors.js';

/**
 * @param {object} deps
 * @param {object} deps.jurisdiction — createJurisdictionController instance
 * @param {(round: object) => Promise<void>} deps.performRoundVisual
 * @param {(round: object) => void} deps.showStaticResult
 * @param {(balance: object) => void} deps.applyBalance
 * @param {(round: object, result: object) => void} deps.onRoundSettled
 * @param {(text: string) => void} deps.setMessage
 * @param {() => number} deps.getBetApi
 * @param {(amountApi: number) => void} deps.setBetFromApi
 */
export function createStakeLifecycle(deps) {
  const {
    jurisdiction,
    performRoundVisual,
    showStaticResult,
    applyBalance,
    onRoundSettled,
    setMessage,
    getBetApi,
    setBetFromApi,
  } = deps;

  async function reportBookEventsAfter(eventNum, throughIndex) {
    for (let i = eventNum + 1; i <= throughIndex; i += 1) {
      try {
        await reportBetEvent(i);
      } catch (err) {
        console.warn(`bet/event ${i} failed`, err);
      }
    }
  }

  async function waitMinRoundDuration(roundStartMs) {
    const minMs = jurisdiction.minRoundDurationMs;
    const elapsed = Date.now() - roundStartMs;
    if (minMs > elapsed) {
      await new Promise((r) => setTimeout(r, minMs - elapsed));
    }
  }

  /**
   * @param {object} round — open round from /wallet/play or authenticate
   * @param {{ animate?: boolean, recordSession?: boolean, lastEvent?: string | null }} [options]
   */
  async function completeRound(round, { animate = true, recordSession = true, lastEvent = null } = {}) {
    const drop = parsePlinkoDrop(round);
    const multiplier = roundPayoutMultiplier(round);
    setBetFromApi(round.amount);

    const roundStart = Date.now();
    const eventNum = lastEvent === null || lastEvent === undefined ? -1 : Number(lastEvent);

    if (eventNum >= 0) {
      showStaticResult(round);
    } else if (animate) {
      setMessage('Dropping…');
      await performRoundVisual(round);
    } else {
      showStaticResult(round);
    }

    await reportBookEventsAfter(eventNum, 0);
    await reportBookEventsAfter(Math.max(eventNum, 0), 1);

    await waitMinRoundDuration(roundStart);

    await reportBookEventsAfter(Math.max(eventNum, 1), 2);

    const endRes = await endRound();
    applyBalance(endRes.balance);

    const payout = round.payout;
    const result = {
      bucket: drop.bucket,
      multiplier,
      payoutApi: payout,
      profitApi: payout - round.amount,
      replayEvent: endRes.replayEvent,
      round,
    };

    onRoundSettled(round, result, { recordSession });
    return result;
  }

  async function executeDrop({ animate = true } = {}) {
    const playRes = await play({ amountApi: getBetApi(), mode: 'BASE' });
    applyBalance(playRes.balance);
    return completeRound(playRes.round, { animate });
  }

  async function resumeRound(round, { lastEvent = null } = {}) {
    setMessage(messageForRgsCode('ERR_BE'));
    const animate = lastEvent === null || lastEvent === undefined || Number(lastEvent) < 0;
    return completeRound(round, { animate, lastEvent });
  }

  function showCompletedRound(round) {
    if (!round?.state?.length) return false;
    setBetFromApi(round.amount);
    showStaticResult(round);
    const drop = parsePlinkoDrop(round);
    const multiplier = roundPayoutMultiplier(round);
    return {
      bucket: drop.bucket,
      multiplier,
      payoutApi: round.payout,
      profitApi: round.payout - round.amount,
    };
  }

  /**
   * Post-authenticate routing: resume active, show last completed, or ready.
   */
  async function handleAuthRound(round, meta = {}) {
    if (round?.active && round.state?.length) {
      const result = await resumeRound(round, { lastEvent: meta.lastEvent ?? null });
      return { status: 'resumed', result };
    }
    if (round?.state?.length && round.active === false && round.payout !== undefined) {
      const result = showCompletedRound(round);
      return { status: 'completed', result };
    }
    return { status: 'ready', result: null };
  }

  return {
    completeRound,
    executeDrop,
    resumeRound,
    showCompletedRound,
    handleAuthRound,
  };
}
