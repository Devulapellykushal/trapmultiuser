import { useMemo, useRef } from 'react';
import { Decal } from '@react-three/drei';
import * as THREE from 'three';
import { proxy, useSnapshot } from 'valtio';

import { BOTTLE_PRESET, HEIGHT, RADIUS, maxLogoScale } from '../constants/bottle.js';

/** Fixed decal slot below the default logo band (sidebar-only text). */
function labelDecalPosition(placement) {
  const v = new THREE.Vector3();
  if (placement === 'side') {
    v.set(RADIUS - 0.0045, -0.17, 0);
  } else {
    v.set(0, -0.17, RADIUS - 0.0045);
  }
  return v;
}

const DEFAULT_COLORS = { body: '#c4cad4', cap: '#aeb6c2', neck: '#9ca3af' };

export default function BottleWithLogo({
  placement,
  displayTexture,
  dragOffset,
  setDragOffset,
  logoScale,
  setLogoScale,
  dragging,
  setDragging,
  dragStartRef,
  /** Optional valtio proxy `{ body, cap, neck }` for live material colors (combined studio). */
  colors: colorsProxy,
  /** Combined studio: tap body / cap / neck to select for coloring; logo drag attaches to the decal only. */
  onPickPart,
  /** Optional canvas texture (brand + tagline) from sidebar; second decal below logo. */
  labelTexture
}) {
  const meshRef = useRef(null);
  const preset = BOTTLE_PRESET[placement];
  const fallbackColors = useMemo(() => proxy({ ...DEFAULT_COLORS }), []);
  const colorProxy = colorsProxy ?? fallbackColors;
  const colorSnap = useSnapshot(colorProxy);

  const position = useMemo(() => {
    const v = new THREE.Vector3();
    preset.applyOffset(v, dragOffset);
    return v;
  }, [placement, dragOffset, preset]);

  const rotation = useMemo(() => preset.euler(), [preset]);

  const labelPosition = useMemo(() => labelDecalPosition(placement), [placement]);

  const labelScale = useMemo(() => [0.46, 0.13, 0.22], []);

  const labelPickBody = onPickPart
    ? (e) => {
        e.stopPropagation();
        onPickPart('body');
      }
    : undefined;

  const decalScale = useMemo(() => {
    const baseW = 0.26 * logoScale;
    let aspect = 1;
    const img = displayTexture?.image;
    if (img && img.width && img.height) {
      aspect = img.width / img.height;
    }
    const w = baseW;
    const h = baseW / Math.max(aspect, 0.0001);
    const d = 0.22;
    return [w, h, d];
  }, [displayTexture, logoScale]);

  const onLogoPointerDown = (e) => {
    if (!displayTexture) {
      return;
    }
    e.stopPropagation();
    setDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      ox: dragOffset.x,
      oy: dragOffset.y
    };
  };

  const onPointerMove = (e) => {
    if (!dragging || !dragStartRef.current) {
      return;
    }
    e.stopPropagation();
    const d = dragStartRef.current;
    const k = 0.0018;
    const nx = THREE.MathUtils.clamp(d.ox + (e.clientX - d.clientX) * k, -preset.maxU, preset.maxU);
    const ny = THREE.MathUtils.clamp(d.oy - (e.clientY - d.clientY) * k, -preset.maxV, preset.maxV);
    setDragOffset({ x: nx, y: ny });
  };

  const endDrag = (e) => {
    e.stopPropagation();
    setDragging(false);
    dragStartRef.current = null;
  };

  const onWheel = (e) => {
    if (!displayTexture) {
      return;
    }
    e.stopPropagation();
    const delta = -e.deltaY * 0.0009;
    const aspect =
      displayTexture.image?.width && displayTexture.image?.height
        ? displayTexture.image.width / displayTexture.image.height
        : 1;
    const maxScale = maxLogoScale(placement, aspect);
    const next = THREE.MathUtils.clamp(logoScale + delta, 0.35, maxScale);
    setLogoScale(next);
  };

  const groupLogoDragProps =
    onPickPart || !displayTexture
      ? {}
      : {
          onPointerDown: onLogoPointerDown,
          onPointerMove: onPointerMove,
          onPointerUp: endDrag,
          onPointerLeave: endDrag,
          onWheel: onWheel
        };

  const pickPart = (part) => (e) => {
    if (!onPickPart) {
      return;
    }
    e.stopPropagation();
    onPickPart(part);
  };

  const decalDragProps =
    onPickPart && displayTexture
      ? {
          onPointerDown: onLogoPointerDown,
          onPointerMove: onPointerMove,
          onPointerUp: endDrag,
          onPointerLeave: endDrag,
          onWheel: onWheel
        }
      : {};

  return (
    <group {...groupLogoDragProps}>
      <mesh
        ref={meshRef}
        castShadow
        receiveShadow
        position={[0, 0, 0]}
        onPointerDown={onPickPart ? pickPart('body') : undefined}
      >
        <cylinderGeometry args={[RADIUS, RADIUS * 0.92, HEIGHT, 64, 1, false]} />
        <meshPhysicalMaterial
          name="body"
          color={colorSnap.body}
          roughness={0.18}
          metalness={0.02}
          transmission={0.88}
          thickness={0.28}
          envMapIntensity={0.9}
          clearcoat={0.35}
          clearcoatRoughness={0.25}
          transparent
          opacity={0.96}
          toneMapped
        />
        {displayTexture ? (
          <Decal
            debug
            position={position}
            rotation={rotation}
            scale={decalScale}
            map={displayTexture}
            polygonOffsetFactor={-1}
            depthTest
            depthWrite={false}
            {...decalDragProps}
          />
        ) : null}
        {labelTexture ? (
          <Decal
            position={labelPosition}
            rotation={rotation}
            scale={labelScale}
            map={labelTexture}
            polygonOffsetFactor={-2}
            depthTest
            depthWrite={false}
            onPointerDown={labelPickBody}
          />
        ) : null}
      </mesh>
      <mesh castShadow position={[0, HEIGHT * 0.52 + 0.08, 0]} onPointerDown={onPickPart ? pickPart('cap') : undefined}>
        <cylinderGeometry args={[0.12, 0.14, 0.16, 32]} />
        <meshPhysicalMaterial
          name="cap"
          color={colorSnap.cap}
          roughness={0.35}
          metalness={0.05}
          transmission={0.35}
          thickness={0.1}
        />
      </mesh>
      <mesh castShadow position={[0, HEIGHT * 0.52 + 0.2, 0]} onPointerDown={onPickPart ? pickPart('neck') : undefined}>
        <cylinderGeometry args={[0.02, 0.13, 0.06, 24]} />
        <meshStandardMaterial name="neck" color={colorSnap.neck} roughness={0.45} metalness={0.2} />
      </mesh>
    </group>
  );
}
