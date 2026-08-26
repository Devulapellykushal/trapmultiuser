"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crop, X } from "lucide-react";
import * as React from "react";

const VIEW_W = 560;
const VIEW_H = Math.round((VIEW_W * 9) / 16);
const OUT_W = 1280;
const OUT_H = 720;

type Props = {
  open: boolean;
  file: File | null;
  onClose: () => void;
  /** Cropped 16:9 JPEG applied to the warehouse seller banner. */
  onApply: (blob: Blob) => void;
};

/**
 * Drag + zoom editor for a 16:9 horizontal seller image (invoice / PDF header).
 */
export function WarehouseSellerImageAdjustModal({
  open,
  file,
  onClose,
  onApply,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = React.useState(100);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef<{ active: boolean; sx: number; sy: number; px: number; py: number }>(
    { active: false, sx: 0, sy: 0, px: 0, py: 0 },
  );

  /** Bumps after source image loads so `redraw` runs once `imgRef` is usable (avoids blank canvas). */
  const [sourceReadyTick, setSourceReadyTick] = React.useState(0);

  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(0, 0, w, h);
    const z = zoom / 100;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const imgAspect = iw / ih;
    const viewAspect = w / h;
    let drawW: number;
    let drawH: number;
    if (imgAspect > viewAspect) {
      drawH = h * z;
      drawW = drawH * imgAspect;
    } else {
      drawW = w * z;
      drawH = drawW / imgAspect;
    }
    const x = (w - drawW) / 2 + pan.x;
    const y = (h - drawH) / 2 + pan.y;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    const g3 = w / 3;
    const g3y = h / 3;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(g3 * i, 0);
      ctx.lineTo(g3 * i, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g3y * i);
      ctx.lineTo(w, g3y * i);
      ctx.stroke();
    }
  }, [pan.x, pan.y, zoom, sourceReadyTick]);

  React.useEffect(() => {
    if (!open || !file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setZoom(100);
      setPan({ x: 0, y: 0 });
      setSourceReadyTick((t) => t + 1);
    };
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
      imgRef.current = null;
    };
  }, [open, file]);

  React.useEffect(() => {
    redraw();
  }, [redraw]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      sx: pan.x,
      sy: pan.y,
      px: e.clientX,
      py: e.clientY,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    setPan({ x: drag.current.sx + dx, y: drag.current.sy + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current.active = false;
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const exportBlob = React.useCallback((): Promise<Blob | null> => {
    const img = imgRef.current;
    if (!img || !img.complete) return Promise.resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    const w = OUT_W;
    const h = OUT_H;
    const z = zoom / 100;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const imgAspect = iw / ih;
    const viewAspect = w / h;
    let drawW: number;
    let drawH: number;
    if (imgAspect > viewAspect) {
      drawH = h * z;
      drawW = drawH * imgAspect;
    } else {
      drawW = w * z;
      drawH = drawW / imgAspect;
    }
    const scaleK = OUT_W / VIEW_W;
    const x = (w - drawW) / 2 + pan.x * scaleK;
    const y = (h - drawH) / 2 + pan.y * scaleK;
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.restore();
    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
    });
  }, [pan.x, pan.y, zoom]);

  const handleApply = async () => {
    const blob = await exportBlob();
    if (blob) onApply(blob);
    onClose();
  };

  return (
    <AnimatePresence mode="wait">
      {open && file ? (
        <motion.div
          key="seller-img-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 modal-scrim"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative z-[61] w-full max-w-xl mx-4 rounded-2xl border border-white/[0.1] bg-[#111318] shadow-2xl overflow-hidden"
          >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2 text-[#f3eee4]">
            <Crop className="w-5 h-5 text-[#c4a574]" />
            <h2 className="text-base font-semibold">Adjust Image</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#8a867c] hover:bg-white/[0.06] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-black">
            <canvas
              ref={canvasRef}
              width={VIEW_W}
              height={VIEW_H}
              className="w-full h-auto block touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>
          <p className="text-xs text-[#8a867c] leading-relaxed">
            Drag the image to position it. Use the slider to zoom in/out. Final
            crop is 16:9 for invoices and PDFs.
          </p>
          <div>
            <div className="flex justify-between text-xs text-[#c5c0b5] mb-1.5">
              <span>Zoom Level</span>
              <span>{zoom}%</span>
            </div>
            <input
              type="range"
              min={80}
              max={220}
              step={2}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[#c4a574]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[#c5c0b5] hover:text-[#f3eee4] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2.5 rounded-xl bg-[#c4a574] text-[#0c0d10] text-sm font-medium hover:bg-[#d4b88a] transition-colors"
          >
            Save &amp; Apply
          </button>
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
