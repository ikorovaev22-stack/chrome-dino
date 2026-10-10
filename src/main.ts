// Entry point. Supplies what Chrome normally injects into the offline error
// page (localized strings and the browser-side ErrorPageController), then lets
// the original neterror.ts render the page and start the dino game.

import './interstitial_core.css';
import './interstitial_common.css';
import './neterror.css';
import './neterror.js';

import {getLanguage, getLoadTimeData} from './strings.js';

const HIGH_SCORE_KEY = 'chrome-dino:high-score';

function readHighScore(): number {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeHighScore(score: number|null) {
  try {
    if (score === null) {
      localStorage.removeItem(HIGH_SCORE_KEY);
    } else {
      localStorage.setItem(HIGH_SCORE_KEY, String(score));
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the high
    // score then lasts only for the current page.
  }
}

const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
const language = getLanguage();
const data = getLoadTimeData(language, isMobile);

document.documentElement.lang = language;
// `?arcade` mimics chrome://dino: the game scales up and the text fades out.
document.title = new URLSearchParams(location.search).has('arcade') ?
    'chrome://dino/' :
    data.title;
window.loadTimeDataRaw = data;

// Chrome keeps the high score in the browser profile; here it lives in
// localStorage. Like the browser, the stored score is sent back
// asynchronously once the game is first started.
window.errorPageController = {
  downloadButtonClick() {},
  reloadButtonClick() {
    location.reload();
  },
  detailsButtonClick() {},
  diagnoseErrorsButtonClick() {},
  portalSigninButtonClick() {},
  savePageForLater() {},
  cancelSavePage() {},
  updateEasterEggHighScore(score: number) {
    writeHighScore(score);
  },
  resetEasterEggHighScore() {
    writeHighScore(null);
  },
  trackEasterEgg() {
    setTimeout(() => window.initializeEasterEggHighScore(readHighScore()));
  },
};
