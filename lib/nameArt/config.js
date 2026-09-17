export const NAME_ART_BACKGROUNDS = [
  { id: 'pearls', name: 'Pearls & ribbons', src: '/name-art/pearls.webp', centre: .46, width: .82 },
  { id: 'skyline', name: 'Shared skyline', src: '/name-art/skyline.webp', centre: .39, width: .82 },
  { id: 'arch', name: 'Heritage arch', src: '/name-art/arch.webp', centre: .45, width: .64 },
];
export const NAME_ART_DEFAULTS = { background: 'pearls', duration: 18, motion: 'reveal', drift: true, paused: false };
export function nameArtBackground(id) { return NAME_ART_BACKGROUNDS.find(item => item.id === id) || NAME_ART_BACKGROUNDS[0]; }
export function cleanGuestName(value) {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{M}][\p{L}\p{M} '\u2019-]{0,29}$/u.test(name) ? name : '';
}
