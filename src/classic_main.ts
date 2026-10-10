// Classic page: the Chrome offline error page with the original game, as in
// the browser. Supplies what Chrome normally injects (localized strings and
// the browser-side ErrorPageController), then lets the original neterror.ts
// render the page and start the dino game.

import './interstitial_core.css';
import './interstitial_common.css';
import './neterror.css';
import './neterror.js';

import {disableExtras} from './extras/mode.js';
import {installHighScoreStore} from './host.js';
import {getLanguage, getLoadTimeData} from './strings.js';

disableExtras();

const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
const language = getLanguage();
const data = getLoadTimeData(language, isMobile);

document.documentElement.lang = language;
// `?arcade` mimics chrome://dino: the game scales up and the text fades out.
document.title = new URLSearchParams(location.search).has('arcade') ?
    'chrome://dino/' :
    data.title;
window.loadTimeDataRaw = data;

installHighScoreStore('chrome-dino:high-score');
