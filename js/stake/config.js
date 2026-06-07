/** Stake-shaped identifiers and URL-driven test flags. */

export const GAME_ID = 'pure-plinko';
export const REPLAY_VERSION = '1';

export function isDevMode() {
  return new URLSearchParams(window.location.search).get('dev') === 'true';
}

export function isReplayMode() {
  return new URLSearchParams(window.location.search).get('replay') === 'true';
}

/** Dev-only mock flags sent to prototype RGS (ignored in production Stake). */
export function getMockFlags() {
  if (!isDevMode()) return null;
  const params = new URLSearchParams(window.location.search);
  const flags = {};
  const jurisdiction = params.get('jurisdiction');
  if (jurisdiction) flags.jurisdiction = jurisdiction;
  if (params.get('mock_err_is') === 'true') flags.err_is = true;
  return Object.keys(flags).length ? flags : null;
}

export function getJurisdictionProfileName() {
  const params = new URLSearchParams(window.location.search);
  return params.get('jurisdiction') || 'server';
}

export function getDevComplianceLabel() {
  const mock = getMockFlags();
  const parts = [`jurisdiction: ${getJurisdictionProfileName()}`];
  if (mock?.err_is) parts.push('mock ERR_IS');
  return parts.join(' · ');
}
