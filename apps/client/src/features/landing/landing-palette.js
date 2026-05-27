/**
 * Landing palette — strict monochrome (#000000 / #FFFFFF) classic shell.
 * FloatingLines / Dome overlays read these for gradients.
 */
export const LANDING_PALETTE = {
  bgDeep: '#000000',
  bgMid: '#0a0a0a',
  bgVia: '#050505',
  /** Primary UI / line accent (white on black) */
  accent: '#ffffff',
  accentMuted: 'rgba(255, 255, 255, 0.12)',
  accentSecondary: '#d4d4d4',
  accentTertiary: '#a3a3a3',
  textMuted: '#a3a3a3',
  borderSubtle: 'rgba(255, 255, 255, 0.12)',
  /** FloatingLines gradient stops */
  lineGradient: ['#ffffff', '#e5e5e5', '#a3a3a3', '#737373'],
  /** FloatingLines hero (dark charcoal stops on black) */
  floatingHeroLinesGradient: ['#171717', '#0a0a0a', '#262626'],
  /** DomeGallery overlay tint */
  domeOverlayBlur: '#000000'
};
