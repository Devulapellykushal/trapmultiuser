import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const TEX_W = 1024;
const TEX_H = 320;

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

/**
 * Raster brand + tagline for a Decal on the bottle. Caller disposes via hook cleanup.
 */
function createLabelTexture(brandName, tagline) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  const cx = TEX_W / 2;
  const maxW = TEX_W - 96;
  let cursorY = 72;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (brandName) {
    ctx.font = "600 56px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    const titleLines = wrapLines(ctx, brandName, maxW);
    const lh = 64;
    for (const ln of titleLines) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(255,255,255,0.82)';
      ctx.fillStyle = '#0a0a0a';
      ctx.strokeText(ln, cx, cursorY);
      ctx.fillText(ln, cx, cursorY);
      cursorY += lh;
    }
    cursorY += 8;
  }

  if (tagline) {
    ctx.font = "300 34px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
    const subLines = wrapLines(ctx, tagline, maxW - 40);
    const lh = 42;
    for (const ln of subLines) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.fillStyle = 'rgba(20,20,20,0.92)';
      ctx.strokeText(ln, cx, cursorY);
      ctx.fillText(ln, cx, cursorY);
      cursorY += lh;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Live THREE.CanvasTexture from sidebar text; null when both strings empty.
 */
export function useBottleLabelTexture(brandName, tagline) {
  const [texture, setTexture] = useState(null);
  const texRef = useRef(null);

  useEffect(() => {
    if (texRef.current) {
      texRef.current.dispose();
      texRef.current = null;
    }

    const bn = (brandName ?? '').trim();
    const tg = (tagline ?? '').trim();
    if (!bn && !tg) {
      setTexture(null);
      return undefined;
    }

    const next = createLabelTexture(bn, tg);
    if (!next) {
      setTexture(null);
      return undefined;
    }
    texRef.current = next;
    setTexture(next);

    return () => {
      if (texRef.current) {
        texRef.current.dispose();
        texRef.current = null;
      }
    };
  }, [brandName, tagline]);

  return texture;
}
