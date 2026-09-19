export const NAME_ART_BACKGROUNDS = [
  { id: 'pearls', name: 'Pearls & ribbons', src: '/name-art/pearls.webp', centre: .46, width: .82 },
  { id: 'skyline', name: 'Shared skyline', src: '/name-art/skyline.webp', centre: .39, width: .82 },
  { id: 'arch', name: 'Heritage arch', src: '/name-art/arch.webp', centre: .45, width: .64 },
];
// `background` is the design a guest starts on before they pick one of their own. The idle
// poster screen no longer uses it: between guests the screen shows the fixed National Day
// plate at /name-art/idle-national-day.webp, which is brand artwork, not a guest backdrop.
// `pairingCode` is a permanent, reusable code so an unattended booth can re-pair itself
// after a reboot or cleared browser data. Change it from the admin at any time.
export const NAME_ART_DEFAULTS = { background: 'pearls', duration: 18, motion: 'reveal', drift: true, paused: false, finishGrace: 10, pairingCode: '23157741' };
export function nameArtBackground(id) { return NAME_ART_BACKGROUNDS.find(item => item.id === id) || NAME_ART_BACKGROUNDS[0]; }
export function cleanGuestName(value) {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]{0,29}$/u.test(name) ? name : '';
}
