import * as THREE from 'three';

/** Neutral WebGL backdrop so bottle glass and solid parts read clearly (dark UI, light stage). */
export const STUDIO_3D_BACKGROUND = '#e6eaf0';

export const RADIUS = 0.36;
export const HEIGHT = 1.35;

export const BOTTLE_PRESET = {
  front: {
    maxU: 0.12,
    maxV: 0.15,
    euler: () => new THREE.Euler(0, 0, 0),
    applyOffset: (out, off) => {
      out.set(off.x, 0.06 + off.y, RADIUS - 0.004);
    }
  },
  side: {
    maxU: 0.12,
    maxV: 0.15,
    euler: () => new THREE.Euler(0, Math.PI / 2, 0),
    applyOffset: (out, off) => {
      out.set(RADIUS - 0.004, 0.06 + off.y, off.x);
    }
  }
};

export function maxLogoScale(placement, aspect) {
  const p = BOTTLE_PRESET[placement] || BOTTLE_PRESET.front;
  const a = aspect && aspect > 0 ? aspect : 1;
  return Math.min((2 * p.maxU) / 0.26, (2 * p.maxV * a) / 0.26);
}
