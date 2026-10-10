// What Chrome normally provides to the dino game from the browser side: a
// place to keep the high score (here: localStorage).

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number|null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, String(value));
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data); values
    // then last only for the current page.
  }
}

/**
 * Installs the stand-in for Chrome's ErrorPageController. Like the browser,
 * it hands the stored score back asynchronously once the game first starts.
 */
export function installHighScoreStore(key: string) {
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
      writeNumber(key, score);
    },
    resetEasterEggHighScore() {
      writeNumber(key, null);
    },
    trackEasterEgg() {
      setTimeout(() => window.initializeEasterEggHighScore(readNumber(key)));
    },
  };
}

export {readNumber, writeNumber};
