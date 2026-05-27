import { Fragment, Suspense, useEffect, useLayoutEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import Loader from '@studio/features/3d-configurator/components/Loader.jsx';
import { STUDIO_3D_BACKGROUND } from '@studio/features/bottle-engraving/constants/bottle.js';

import BottleWithLogo from './BottleWithLogo.jsx';

function GlExpose({ onGlReady }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    onGlReady?.({ gl, scene, camera });
  }, [gl, scene, camera, onGlReady]);
  return null;
}

/** Runs after Suspense content commits so parents can hide boot overlays before paint. */
function SceneReadyPing({ onSceneReady }) {
  useLayoutEffect(() => {
    onSceneReady?.();
  }, [onSceneReady]);
  return null;
}

/** Re-export for any bundle that imported the old name. */
export const BOTTLE_SCENE_BACKGROUND = STUDIO_3D_BACKGROUND;

/** Same baseline as ProductConfiguratorApp: ambient + spot, ground shadow, OrbitControls; camera tuned for bottle hero. */
export default function BottleCanvas({
  placement,
  displayTexture,
  dragOffset,
  setDragOffset,
  logoScale,
  setLogoScale,
  dragging,
  setDragging,
  dragStartRef,
  onGlReady,
  /** Fires once when the lazy bottle scene has mounted (after Suspense). */
  onSceneReady,
  /** Optional valtio proxy `{ body, cap, neck }` for bottle materials (combined studio). */
  bottleColors,
  /** When set, body/cap/neck clicks select that part (logo drag is bound to the decal only). */
  onPickPart,
  /** Optional decal texture for brand name + tagline (from sidebar). */
  labelTexture
}) {
  return (
    <Canvas
      shadows
      camera={{ position: [1.1, 0.35, 1.85], fov: 45, near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      }}
      dpr={[1, 2]}
    >
      <GlExpose onGlReady={onGlReady} />
      <color attach="background" args={[STUDIO_3D_BACKGROUND]} />
      <ambientLight intensity={0.88} />
      <spotLight intensity={1.05} penumbra={0.88} position={[6, 12, 8]} castShadow />
      <directionalLight position={[-5, 8, -4]} intensity={0.48} />
      <directionalLight position={[4, 3, 6]} intensity={0.38} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0.35]} position={[0, -0.95, 0]}>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.18} />
      </mesh>
      <Suspense fallback={<Loader />}>
        <Fragment>
          <SceneReadyPing onSceneReady={onSceneReady} />
          <BottleWithLogo
            placement={placement}
            displayTexture={displayTexture}
            dragOffset={dragOffset}
            setDragOffset={setDragOffset}
            logoScale={logoScale}
            setLogoScale={setLogoScale}
            dragging={dragging}
            setDragging={setDragging}
            dragStartRef={dragStartRef}
            colors={bottleColors}
            onPickPart={onPickPart}
            labelTexture={labelTexture}
          />
        </Fragment>
      </Suspense>
      <OrbitControls makeDefault minDistance={1.35} maxDistance={4.5} enablePan={false} />
    </Canvas>
  );
}
