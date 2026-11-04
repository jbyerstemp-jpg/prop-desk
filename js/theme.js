/* Theme colors for Prop Desk. The accent is the only chosen color; surfaces are mixed from it,
   except Vault and Wasteland, whose panels stay fixed so prices stay readable.
   Gains and losses are separate tokens and never follow the accent. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Theme = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const PRESETS = [
    { id: 'fo4', name: 'Fallout 4', hex: '#14ff17' },
    { id: 'fo3', name: 'Fallout 3', hex: '#1aff80' },
    { id: 'nv', name: 'New Vegas', hex: '#ffb642' },
    { id: 'blue', name: 'Blue', hex: '#2ecfff' },
    { id: 'white', name: 'White', hex: '#c5ffff' },
    { id: 'vault', name: 'Vault', hex: '#ffc200' },
    { id: 'waste', name: 'Wasteland', hex: '#e8a33a' }
  ];
  const GAIN = '#2ebd85', LOSS = '#f6465d';
  const VAULT = { bg: '#121313', card: '#1a1c1c', tx: '#f4f5f2', mu: '#c8cac7', line: '#4e504f', panel: '#325886' };
  const WASTE = { bg: '#2a2622', card: '#322c27', tx: '#d9c8a8', mu: '#c2a46a', line: '#5a5a4a' };
  /* Daytime wasteland: paper page, ink text. The accent is still only trim and signage. */
  const WASTE_DAY = { bg: '#f3ead7', card: '#fff8ec', tx: '#2a2622', mu: '#5e564c', line: '#c4b396' };

  const hexToRgb = h => {
    const s = String(h || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');
  /* color-mix(in srgb, A weight%, B): weight is A's share, 0 to 1. */
  function mix(a, b, weight) {
    const A = hexToRgb(a), B = hexToRgb(b);
    if (!A || !B) return a || b;
    const w = Math.max(0, Math.min(1, weight));
    return rgbToHex(A[0] * w + B[0] * (1 - w), A[1] * w + B[1] * (1 - w), A[2] * w + B[2] * (1 - w));
  }
  function hslToHex(h, s, l) {
    const S = (s == null ? 100 : s) / 100, L = (l == null ? 62 : l) / 100, H = ((+h || 0) % 360 + 360) % 360;
    const k = n => (n + H / 30) % 12, A = S * Math.min(L, 1 - L);
    const f = n => 255 * (L - A * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
    return rgbToHex(f(0), f(8), f(4));
  }
  function hueOf(hex) {
    const rgb = hexToRgb(hex); if (!rgb) return 0;
    const [r, g, b] = rgb.map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
    return h;
  }
  /* Pip-Boy: 6% accent into near-black, dim text at 65% so every listed preset stays above 4.5:1. */
  function pipFromAccent(accent) {
    const bg = mix(accent, '#050605', 0.06);
    return {
      bg, card: mix(accent, '#050605', 0.11), tx: accent, acc: accent,
      mu: mix(accent, bg, 0.65), line: mix(accent, bg, 0.40),
      glow: mix(accent, '#000000', 0.55)
    };
  }
  function lum(hex) {
    const rgb = hexToRgb(hex); if (!rgb) return 0;
    const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [r, g, b] = rgb.map(f);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const L1 = lum(a), L2 = lum(b), hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  return { PRESETS, GAIN, LOSS, VAULT, WASTE, WASTE_DAY, hexToRgb, mix, hslToHex, hueOf, pipFromAccent, contrast };
});
