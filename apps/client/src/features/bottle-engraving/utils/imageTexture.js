import * as THREE from 'three';

/** @param {THREE.Texture} texture */
export function cloneTextureGrayscale(texture) {
  const img = texture.image;
  if (!img || !img.width) {
    return texture.clone();
  }
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return texture.clone();
  }
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = y;
    px[i + 1] = y;
    px[i + 2] = y;
  }
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = THREE.SRGBColorSpace;
  out.needsUpdate = true;
  out.anisotropy = texture.anisotropy;
  return out;
}

/**
 * Rasterize SVG string or URL to a PNG data URL for THREE.TextureLoader.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function rasterizeSvgFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const maxSide = 2048;
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unsupported'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('SVG raster failed'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    };
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file);
  });
}
