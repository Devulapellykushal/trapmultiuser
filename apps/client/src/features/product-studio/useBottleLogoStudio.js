import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { maxLogoScale } from '@studio/features/bottle-engraving/constants/bottle.js';
import { cloneTextureGrayscale, rasterizeSvgFileToDataUrl } from '@studio/features/bottle-engraving/utils/imageTexture.js';
import { apiUrl } from '@studio/lib/api-base.js';

export const LOGO_ACCEPT = '.png,.jpg,.jpeg,.svg,.bmp,.webp,.gif';

export function estimateDpiWarning(width) {
  if (!width) {
    return null;
  }
  const assumedPrintInches = 3;
  const dpi = width / assumedPrintInches;
  if (width < 500 || dpi < 300) {
    return `Low resolution: ${width}px wide (~${dpi.toFixed(0)} dpi at ${assumedPrintInches}" print). A sharper file is recommended.`;
  }
  return null;
}

export async function readImageWidth(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth || img.width);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Logo upload, placement, engraving preview, and mockup export — shared by unified studio.
 */
export function useBottleLogoStudio() {
  const r3fRef = useRef(null);
  const dragStartRef = useRef(null);
  const baseTextureRef = useRef(null);
  const grayTextureRef = useRef(null);
  const engraveOnRef = useRef(true);

  const [placement, setPlacement] = useState('front');
  const [engraveOn, setEngraveOn] = useState(true);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [logoScale, setLogoScale] = useState(1);
  const [dragging, setDragging] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warn, setWarn] = useState(null);
  const [uploadMeta, setUploadMeta] = useState(null);
  const [lastRasterFile, setLastRasterFile] = useState(null);

  const [baseTexture, setBaseTexture] = useState(null);
  const [displayTexture, setDisplayTexture] = useState(null);

  useEffect(() => {
    engraveOnRef.current = engraveOn;
  }, [engraveOn]);

  const disposeTextures = useCallback(() => {
    baseTextureRef.current?.dispose?.();
    grayTextureRef.current?.dispose?.();
    baseTextureRef.current = null;
    grayTextureRef.current = null;
    setBaseTexture(null);
    setDisplayTexture(null);
  }, []);

  useEffect(() => {
    return () => {
      disposeTextures();
    };
  }, [disposeTextures]);

  const applyTextures = useCallback((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.anisotropy = 8;
    baseTextureRef.current?.dispose?.();
    grayTextureRef.current?.dispose?.();
    baseTextureRef.current = tex;
    const gray = cloneTextureGrayscale(tex);
    grayTextureRef.current = gray;
    setBaseTexture(tex);
    setDisplayTexture(engraveOnRef.current ? gray : tex);
  }, []);

  useEffect(() => {
    if (!baseTextureRef.current) {
      return;
    }
    setDisplayTexture(engraveOn ? grayTextureRef.current : baseTextureRef.current);
  }, [engraveOn]);

  const loadFromUrl = useCallback(
    (url, revokeAfter) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        url,
        (tex) => {
          if (revokeAfter) {
            URL.revokeObjectURL(url);
          }
          applyTextures(tex);
        },
        undefined,
        (err) => {
          if (revokeAfter) {
            URL.revokeObjectURL(url);
          }
          setError(err?.message || 'Failed to load texture');
        }
      );
    },
    [applyTextures]
  );

  const handleFile = async (file) => {
    if (!file) {
      return;
    }
    setError(null);
    setWarn(null);
    setBusy(true);

    try {
      let uploadFile = file;
      let previewUrl;

      if (file.type === 'image/svg+xml') {
        const dataUrl = await rasterizeSvgFileToDataUrl(file);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        uploadFile = new File([blob], file.name.replace(/\.svg$/i, '.png'), { type: 'image/png' });
        previewUrl = dataUrl;
        setWarn('SVG was rasterized for preview and upload.');
      } else {
        const w = await readImageWidth(file);
        const low = estimateDpiWarning(w);
        if (low) {
          setWarn(low);
        }
        previewUrl = URL.createObjectURL(file);
        loadFromUrl(previewUrl, true);
      }

      if (file.type === 'image/svg+xml') {
        loadFromUrl(previewUrl, false);
      }

      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await fetch(apiUrl('/api/upload'), { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json.detail === 'string' ? json.detail : json.detail?.[0]?.msg || `Upload failed (${res.status})`
        );
      }
      setUploadMeta(json);
      setLastRasterFile(uploadFile);
    } catch (e) {
      setError(e?.message || String(e));
      disposeTextures();
      setLastRasterFile(null);
    } finally {
      setBusy(false);
    }
  };

  const onUploadInput = (e) => {
    const f = e.target.files?.[0];
    void handleFile(f);
    e.target.value = '';
  };

  const resetLayout = () => {
    setDragOffset({ x: 0, y: 0 });
    setLogoScale(1);
  };

  const onGlReady = useCallback((ctx) => {
    r3fRef.current = ctx;
  }, []);

  const downloadMockup = async () => {
    const ctx = r3fRef.current;
    if (!ctx?.gl?.domElement) {
      setError('Canvas not ready yet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      ctx.gl.render(ctx.scene, ctx.camera);
      const dataUrl = ctx.gl.domElement.toDataURL('image/jpeg', 0.92);
      const name = `mockup_${Date.now()}.jpg`;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = name;
      a.click();

      const saveRes = await fetch(apiUrl('/api/save-mockup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl })
      });
      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(
          typeof saveJson.detail === 'string'
            ? saveJson.detail
            : saveJson.detail?.[0]?.msg || `Save mockup failed (${saveRes.status})`
        );
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadBmpForLaser = async () => {
    if (!lastRasterFile) {
      setError('Upload a logo first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', lastRasterFile);
      const res = await fetch(apiUrl('/api/convert-bmp'), { method: 'POST', body: fd });
      if (!res.ok) {
        let msg = `BMP conversion failed (${res.status})`;
        try {
          const j = await res.json();
          msg = typeof j.detail === 'string' ? j.detail : msg;
        } catch {
          /* binary body */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logo_${Date.now()}.bmp`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const placementLabel = useMemo(
    () => (placement === 'front' ? 'Front placement' : 'Side placement'),
    [placement]
  );

  const logoAspect = useMemo(() => {
    const img = baseTexture?.image;
    if (img && img.width && img.height) {
      return img.width / img.height;
    }
    return 1;
  }, [baseTexture]);

  const sliderMax = useMemo(() => maxLogoScale(placement, logoAspect), [placement, logoAspect]);

  useEffect(() => {
    if (logoScale > sliderMax) {
      setLogoScale(sliderMax);
    }
  }, [logoScale, sliderMax]);

  return {
    r3fRef,
    dragStartRef,
    placement,
    setPlacement,
    engraveOn,
    setEngraveOn,
    dragOffset,
    setDragOffset,
    logoScale,
    setLogoScale,
    dragging,
    setDragging,
    busy,
    error,
    warn,
    uploadMeta,
    lastRasterFile,
    baseTexture,
    displayTexture,
    onUploadInput,
    resetLayout,
    onGlReady,
    downloadMockup,
    downloadBmpForLaser,
    placementLabel,
    sliderMax
  };
}
