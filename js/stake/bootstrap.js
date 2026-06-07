import { authenticate, fetchBalance, isReplayMode } from '../rgs.js';
import { messageForRgsCode, isSessionFatal } from './errors.js';
import { getDevComplianceLabel, getJurisdictionProfileName, getMockFlags } from './config.js';

export { getDevComplianceLabel };

/**
 * @param {object} ctx
 * @param {(data: object) => void} ctx.applyAuthConfig
 * @param {object} ctx.lifecycle — createStakeLifecycle()
 * @param {(text: string) => void} ctx.setMessage
 * @param {() => void} ctx.onReady
 * @param {(ready: boolean) => void} ctx.setRgsReady
 * @param {(outcome: object) => void} [ctx.onAuthRound]
 */
export async function bootstrapPlayMode(ctx) {
  const { applyAuthConfig, lifecycle, setMessage, onReady, setRgsReady } = ctx;
  setMessage('Connecting to RGS…');

  try {
    const data = await authenticate();
    applyAuthConfig(data);
    setRgsReady(true);

    const authOutcome = await lifecycle.handleAuthRound(data.round, {
      lastEvent: data.meta?.lastEvent,
    });

    ctx.onAuthRound?.(authOutcome);

    if (authOutcome.status === 'ready') {
      setMessage('Set bet · press Drop.');
    }
    onReady();
  } catch (err) {
    console.error(err);
    const code = String(err.message);
    setRgsReady(false);
    setMessage(isSessionFatal(code) ? messageForRgsCode(code) : 'RGS unavailable — run: node server.mjs');
  }
}

export function attachBalanceRefresh(ctx) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || isReplayMode() || !ctx.rgsReady || ctx.isBusy()) {
      return;
    }
    fetchBalance()
      .then((balanceObj) => {
        ctx.applyBalance(balanceObj);
        ctx.syncHud();
      })
      .catch((err) => console.warn('balance refresh failed', err));
  });
}
