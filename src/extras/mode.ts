/**
 * Whether the extended game (coins, power-ups, new obstacles, weather) is on.
 * `?classic` or `#classic` in the URL gives the original Chrome game.
 */
export const EXTRAS_ENABLED: boolean =
    !new URLSearchParams(location.search).has('classic') &&
    location.hash !== '#classic';
