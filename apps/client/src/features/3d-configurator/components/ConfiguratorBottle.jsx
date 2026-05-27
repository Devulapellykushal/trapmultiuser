import { useSnapshot } from 'valtio';

import { HEIGHT, RADIUS } from '@studio/features/bottle-engraving/constants/bottle.js';

/**
 * Procedural glass-style bottle for the 3D configurator (no external GLTF).
 * Part names match ColorPicker / valtio keys: body, cap, neck.
 */
export default function ConfiguratorBottle({ colors, updateCurrent, castShadow, ...rest }) {
  const snap = useSnapshot(colors);

  return (
    <group {...rest} dispose={null} position={[0, -0.42, 0]} rotation={[0, 0.55, 0]}>
      <mesh
        castShadow={castShadow}
        onPointerDown={(e) => {
          e.stopPropagation();
          updateCurrent(e.object.material.name);
        }}
      >
        <cylinderGeometry args={[RADIUS, RADIUS * 0.92, HEIGHT, 64, 1, false]} />
        <meshPhysicalMaterial
          name='body'
          color={snap.body}
          roughness={0.2}
          metalness={0.04}
          transmission={0.82}
          thickness={0.26}
          envMapIntensity={0.85}
          clearcoat={0.3}
          clearcoatRoughness={0.28}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh
        castShadow={castShadow}
        position={[0, HEIGHT * 0.52 + 0.08, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          updateCurrent(e.object.material.name);
        }}
      >
        <cylinderGeometry args={[0.12, 0.14, 0.16, 32]} />
        <meshPhysicalMaterial
          name='cap'
          color={snap.cap}
          roughness={0.32}
          metalness={0.06}
          transmission={0.38}
          thickness={0.1}
        />
      </mesh>
      <mesh
        castShadow={castShadow}
        position={[0, HEIGHT * 0.52 + 0.2, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          updateCurrent(e.object.material.name);
        }}
      >
        <cylinderGeometry args={[0.02, 0.13, 0.06, 24]} />
        <meshStandardMaterial name='neck' color={snap.neck} roughness={0.42} metalness={0.22} />
      </mesh>
    </group>
  );
}
