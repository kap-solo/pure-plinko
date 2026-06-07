/** RGS error codes → player-facing copy (Stake ERR_* set). */

export function messageForRgsCode(code) {
  switch (code) {
    case 'ERR_IS':
      return 'Session expired — reopen the game from Stake.';
    case 'ERR_IPB':
      return 'Not enough balance.';
    case 'ERR_BE':
      return 'Resuming unfinished round…';
    case 'ERR_GLE':
      return 'Gambling limit reached.';
    case 'ERR_BNF':
      return 'Replay not found.';
    case 'ERR_GEN':
      return 'Server error — try again shortly.';
    default:
      return `Error — ${code}`;
  }
}

export function isSessionFatal(code) {
  return code === 'ERR_IS' || code === 'ERR_ATE';
}
