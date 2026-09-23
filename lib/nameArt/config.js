// The booth uploads a background id with every poster and the API checks it against this
// list, so these must stay in step with DESIGNS in the booth's app.js.
export const NAME_ART_BACKGROUNDS = [
  { id: 'gateway', name: 'Two shores', src: '/name-art/gateway.webp', centre: .394, width: .80 },
  { id: 'arch2', name: 'Heritage arch', src: '/name-art/arch2.webp', centre: .445, width: .46 },
  { id: 'shore', name: 'Shared skyline', src: '/name-art/shore.webp', centre: .486, width: .68 },
  { id: 'waves', name: 'Gulf waves', src: '/name-art/waves.webp', centre: .486, width: .70 },
];
// `background` is the design a guest starts on before they pick one of their own. The idle
// poster screen no longer uses it: between guests the screen shows the fixed National Day
// plate at /name-art/idle-national-day.webp, which is brand artwork, not a guest backdrop.
// `pairingCode` is a permanent, reusable code so an unattended booth can re-pair itself
// after a reboot or cleared browser data. Change it from the admin at any time.
/* The selfie countdown runs on the booth tablet and on the big screen at the same moment.
   The server fixes when it starts - leadMs after the screen picks the poster up, time for the
   image to load and resolve - and tells each device how far away that is, so neither has to
   trust its own clock against the other's. seconds and the band window must match SELFIE_*
   and BAND_* in the booth's app.js, which runs offline and cannot import this file. */
export const NAME_ART_SELFIE = { leadMs: 2000, seconds: 5, bandFrom: 14, bandTo: 17 };
/* The client report counts from the event's first day (Bahrain time), so setup and test
   posters made before it stay out of the numbers. */
export const NAME_ART_REPORT = { from: '2026-09-23', event: 'Saudi National Day 2026', venue: 'Bahrain International Airport' };
// Bahrain keeps UTC+3 all year, so the band's set is a fixed window in UTC.
export function nameArtBandIsOn(date = new Date()) {
  const hour = (date.getUTCHours() + 3) % 24 + date.getUTCMinutes() / 60;
  return hour >= NAME_ART_SELFIE.bandFrom && hour < NAME_ART_SELFIE.bandTo;
}
export const NAME_ART_DEFAULTS = { background: 'gateway', duration: 18, motion: 'reveal', drift: true, paused: false, finishGrace: 10, pairingCode: '23157741' };
export function nameArtBackground(id) { return NAME_ART_BACKGROUNDS.find(item => item.id === id) || NAME_ART_BACKGROUNDS[0]; }
export function cleanGuestName(value) {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]{0,29}$/u.test(name) ? name : '';
}
