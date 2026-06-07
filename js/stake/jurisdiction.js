/**
 * Jurisdiction rules from /wallet/authenticate, with optional dev URL overrides.
 * Game UI reads flags from here — never hard-code regional behaviour in game.js.
 */

export const JURISDICTION_PROFILES = {
  server: {},
  default: {},
  strict: {
    disabledTurbo: true,
    disabledSuperTurbo: true,
    disabledAutoplay: true,
    disabledSpacebar: true,
    disabledSlamstop: true,
    displayNetPosition: false,
    displayRTP: false,
    minimumRoundDuration: 2500,
  },
};

const DEFAULTS = {
  disabledTurbo: false,
  disabledSuperTurbo: false,
  disabledAutoplay: false,
  disabledSpacebar: false,
  disabledSlamstop: false,
  displayNetPosition: true,
  displayRTP: true,
  displaySessionTimer: false,
  minimumRoundDuration: 0,
};

/** @param {(state: object) => void} [onChange] */
export function createJurisdictionController(onChange) {
  const state = { ...DEFAULTS };
  let profileName = 'server';

  function snapshot() {
    return { ...state, profileName };
  }

  function notify() {
    onChange?.(snapshot());
  }

  function mergeFromServer(serverJurisdiction = {}) {
    Object.assign(state, DEFAULTS, serverJurisdiction);
    profileName = 'server';
    notify();
  }

  /** Dev: URL ?jurisdiction=strict overlays server after authenticate. */
  function applyDevProfile(profileKey) {
    if (!profileKey || profileKey === 'server') return;
    const overlay = JURISDICTION_PROFILES[profileKey];
    if (!overlay) return;
    Object.assign(state, overlay);
    profileName = profileKey;
    notify();
  }

  return {
    get state() {
      return state;
    },
    get profileName() {
      return profileName;
    },
    get turboAllowed() {
      return !state.disabledTurbo && !state.disabledSuperTurbo;
    },
    get spacebarAllowed() {
      return !state.disabledSpacebar;
    },
    get autoplayAllowed() {
      return !state.disabledAutoplay;
    },
    get minRoundDurationMs() {
      return state.minimumRoundDuration || 0;
    },
    get showNetPosition() {
      return state.displayNetPosition;
    },
    get showRtp() {
      return state.displayRTP;
    },
    mergeFromServer,
    applyDevProfile,
    snapshot,
  };
}
