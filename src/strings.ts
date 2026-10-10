// Localized strings for the offline error page, in the shape Chrome's
// LocalizedError passes to neterror.ts as `loadTimeDataRaw` for
// DNS_PROBE_FINISHED_NO_INTERNET. Texts are taken verbatim from
// components/error_page_strings.grdp and components_strings_ru.xtb.

interface Strings {
  title: string;
  tryHeader: string;
  checkHardware: string;
  checkWifi: string;
  instructionsTouch: string;
  instructionsKeyboard: string;
  instructionsHybrid: string;
  ariaLabelTouch: string;
  ariaLabelKeyboard: string;
  ariaLabelHybrid: string;
  descriptionDesktop: string;
  descriptionMobile: string;
  gameOver: string;
  highScore: string;
  jump: string;
  started: string;
  speedToggle: string;
}

const STRINGS: Record<'ru'|'en', Strings> = {
  ru: {
    title: 'Нет подключения к интернету',
    tryHeader: 'Попробуйте сделать следующее:',
    checkHardware: 'Проверьте сетевые кабели, модем и маршрутизатор.',
    checkWifi: 'Подключитесь к сети Wi-Fi ещё раз.',
    instructionsTouch: 'Чтобы начать игру, нажмите на динозаврика.',
    instructionsKeyboard: 'Чтобы начать игру, нажмите Пробел.',
    instructionsHybrid:
        'Чтобы начать игру, нажмите на динозаврика или клавишу Пробел.',
    ariaLabelTouch: 'Игра Chrome Dino. Нажмите, чтобы начать.',
    ariaLabelKeyboard: 'Игра Chrome Dino. Чтобы начать, нажмите Пробел.',
    ariaLabelHybrid: 'Игра Chrome Dino. Чтобы начать, нажмите на ' +
        'динозаврика или клавишу Пробел.',
    descriptionDesktop: 'Игра Dino. Пиксельный динозаврик бежит по ' +
        'пустыне, уворачиваясь от кактусов и птеродактилей. Услышав звуковую ' +
        'подсказку, нажмите Пробел, чтобы перепрыгнуть препятствие.',
    descriptionMobile: 'Игра Dino. Пиксельный динозаврик бежит по ' +
        'пустыне, уворачиваясь от кактусов и птеродактилей. Услышав звуковую ' +
        'подсказку, нажмите на экран, чтобы перепрыгнуть препятствие.',
    gameOver: 'Игра закончена. Ваш результат: $1.',
    highScore: 'Ваш лучший результат: $1.',
    jump: 'Прыгайте!',
    started: 'Игра началась.',
    speedToggle: 'Запустить медленнее',
  },
  en: {
    title: 'No internet',
    tryHeader: 'Try:',
    checkHardware: 'Checking the network cables, modem, and router',
    checkWifi: 'Reconnecting to Wi-Fi',
    instructionsTouch: 'Tap the dino to play',
    instructionsKeyboard: 'Press space to play',
    instructionsHybrid: 'Tap the dino or press space to play',
    ariaLabelTouch: 'Dino game, tap to play',
    ariaLabelKeyboard: 'Dino game, press space to play',
    ariaLabelHybrid: 'Dino game, tap the dino or press space to play',
    descriptionDesktop: 'Dino game. A pixelated dinosaur dodges cacti and ' +
        'pterodactyls as it runs across a desolate landscape. When you hear ' +
        'an audio cue, press space to jump over obstacles.',
    descriptionMobile: 'Dino game. A pixelated dinosaur dodges cacti and ' +
        'pterodactyls as it runs across a desolate landscape. When you hear ' +
        'an audio cue, tap to jump over obstacles.',
    gameOver: 'Game over, your score is $1.',
    highScore: 'Your highest score is $1.',
    jump: 'Jump!',
    started: 'Game started.',
    speedToggle: 'Start slower',
  },
};

export function getLanguage(): 'ru'|'en' {
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'ru' || requested === 'en') {
    return requested;
  }
  return navigator.languages.some(lang => /^(ru|be|uk|kk)\b/i.test(lang)) ?
      'ru' :
      'en';
}

export function getLoadTimeData(language: 'ru'|'en', isMobile: boolean) {
  const s = STRINGS[language];
  return {
    title: s.title,
    errorCode: 'DNS_PROBE_FINISHED_NO_INTERNET',
    heading: {msg: s.title},
    iconClass: 'icon-offline',
    isOfflineError: true,
    suggestionsSummaryListHeader: s.tryHeader,
    suggestionsSummaryList: [
      {summary: s.checkHardware},
      {summary: s.checkWifi},
    ],
    dinoGameA11yAriaLabel: s.ariaLabelKeyboard,
    dinoGameA11yAriaLabelTouch: s.ariaLabelTouch,
    dinoGameA11yAriaLabelKeyboard: s.ariaLabelKeyboard,
    dinoGameA11yAriaLabelHybrid: s.ariaLabelHybrid,
    dinoGameInstructionsTouch: s.instructionsTouch,
    dinoGameInstructionsKeyboard: s.instructionsKeyboard,
    dinoGameInstructionsHybrid: s.instructionsHybrid,
    dinoGameA11yDescription:
        isMobile ? s.descriptionMobile : s.descriptionDesktop,
    dinoGameA11yGameOver: s.gameOver,
    dinoGameA11yHighScore: s.highScore,
    dinoGameA11yJump: s.jump,
    dinoGameA11yStartGame: s.started,
    dinoGameA11ySpeedToggle: s.speedToggle,
    language,
    textdirection: 'ltr',
  };
}
