/**
 * Public GLTF assets live under /public/assets/3d (served as /assets/3d/...).
 */
export function gltfUrl(relativePath) {
  const base = import.meta.env.BASE_URL ?? '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}assets/3d/${relativePath}`;
}

export const GLTF_PATHS = {
  shoe: () => gltfUrl('Shoe/shoe.gltf'),
  rocket: () => gltfUrl('Rocket/scene.gltf'),
  axe: () => gltfUrl('Axe/scene.gltf'),
  insect: () => gltfUrl('Insect/scene.gltf'),
  teapot: () => gltfUrl('Teapot/scene.gltf')
};
