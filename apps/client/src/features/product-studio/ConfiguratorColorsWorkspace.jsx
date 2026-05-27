import { Suspense } from 'react';

import { Float, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';

import { STUDIO_3D_BACKGROUND } from '@studio/features/bottle-engraving/constants/bottle.js';
import ConfiguratorBottle from '@studio/features/3d-configurator/components/ConfiguratorBottle.jsx';
import Loader from '@studio/features/3d-configurator/components/Loader.jsx';

/**
 * 3D color studio canvas — lifted for use beside the shared product-studio shell.
 */
export default function ConfiguratorColorsWorkspace({ bottleState, updateBottleCurrent }) {
  return (
    <div className="configurator-canvas-wrap">
      <Canvas
        shadows
        camera={{ position: [1.15, 0.35, 2], fov: 45 }}
        gl={{
          antialias: true,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance'
        }}
        dpr={[1, 2]}
        onPointerMissed={() => updateBottleCurrent(null)}
      >
        <color attach="background" args={[STUDIO_3D_BACKGROUND]} />
        <ambientLight intensity={0.88} />
        <spotLight intensity={1.02} penumbra={0.92} position={[7, 14, 10]} castShadow />
        <directionalLight position={[-5, 8, -4]} intensity={0.45} />
        <directionalLight position={[4, 3, 6]} intensity={0.35} />
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 1.1]} position={[0, -1, 0]}>
          <planeGeometry args={[100, 100]} />
          <shadowMaterial opacity={0.2} />
        </mesh>
        <Suspense fallback={<Loader />}>
          <Float speed={1} rotationIntensity={0.35} floatIntensity={0.25} floatingRange={[0, 0.12]}>
            <ConfiguratorBottle castShadow colors={bottleState.colors} updateCurrent={updateBottleCurrent} />
          </Float>
        </Suspense>
        <OrbitControls maxDistance={5} minDistance={1.5} makeDefault />
      </Canvas>
    </div>
  );
}
