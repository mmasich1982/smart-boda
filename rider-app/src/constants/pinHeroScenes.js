// rider-app/src/constants/pinHeroScenes.js — identical to cleaned.html's PIN_HERO_SCENES.
// `stars`/`clouds` decide which animated layer SkyHeroBand renders; `pos` places the floating
// celestial icon (sun/moon/cloud) as a percentage of the hero's width/height.
export const PIN_HERO_SCENES = [
  { key: 'lateNight', label: 'Late Night', from: 23, to: 5,  greeting: 'Burning the midnight oil', icon: '🌙', stars: true,  clouds: false, pos: { top: '20%', left: '50%' } },
  { key: 'morning',   label: 'Morning',    from: 5,  to: 10, greeting: 'Good morning',              icon: '🌅', stars: false, clouds: true,  pos: { top: '50%', left: '20%' } },
  { key: 'midday',    label: 'Midday',     from: 10, to: 14, greeting: 'Good midday',               icon: '🔆', stars: false, clouds: true,  pos: { top: '16%', left: '50%' } },
  { key: 'afternoon', label: 'Afternoon',  from: 14, to: 17, greeting: 'Good afternoon',            icon: '🌤️', stars: false, clouds: true,  pos: { top: '22%', left: '78%' } },
  { key: 'evening',   label: 'Evening',    from: 17, to: 19, greeting: 'Good evening',              icon: '🌇', stars: false, clouds: false, pos: { top: '52%', left: '82%' } },
  { key: 'night',     label: 'Night',      from: 19, to: 23, greeting: 'Riding into the night',     icon: '🌆', stars: true,  clouds: false, pos: { top: '24%', left: '68%' } },
];

// Wraps around midnight (from > to, e.g. lateNight 23→5) exactly like cleaned.html's getPinHeroScene.
export function getCurrentScene(hour) {
  // EXC-SB04-009: neutral fallback if hour is unreadable/anomalous
  if (typeof hour !== 'number' || Number.isNaN(hour) || hour < 0 || hour > 23) {
    return { key: 'evening', label: 'Welcome', greeting: 'Welcome back', icon: '👋', stars: false, clouds: false, pos: { top: '52%', left: '82%' } };
  }
  return (
    PIN_HERO_SCENES.find((s) => (s.from < s.to ? hour >= s.from && hour < s.to : hour >= s.from || hour < s.to)) ||
    PIN_HERO_SCENES[0]
  );
}

// Per-scene sky-gradient colors (cleaned.html's .pinlogin-hero.scene-* rules) — used by
// SkyHeroBand's LinearGradient. Never blue-dominant except midday, matching the prototype.
export const PIN_HERO_GRADIENTS = {
  lateNight: ['#05060f', '#101233', '#1c1f4a'],
  morning:   ['#2b2140', '#7a3d4a', '#f2874a'],
  midday:    ['#123a52', '#2f7fb0', '#9fdcef'],
  afternoon: ['#3a2a10', '#a85d16', '#ffb648'],
  evening:   ['#241436', '#7a2f4e', '#ff7a4d'],
  night:     ['#0c0d1f', '#1a1f3d', '#2c2a52'],
};

// Fixed layout so stars don't reshuffle on every render — just twinkle in place.
// Identical to cleaned.html's PIN_HERO_STAR_POSITIONS ([left%, top%] pairs).
export const PIN_HERO_STAR_POSITIONS = [
  [8, 16], [18, 34], [27, 10], [35, 44], [46, 20], [54, 38],
  [63, 14], [71, 30], [79, 46], [88, 18], [15, 52], [60, 52],
  [92, 40], [40, 8], [70, 56],
];
