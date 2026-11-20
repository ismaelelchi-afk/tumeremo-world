import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModelParams } from '../../core/types';

/**
 * Caminho GLB/glTF. A biblioteca inicial usa modelos procedurais; este carregador está pronto
 * para modelos `{ source: { type: 'glb', url } }`. Enquanto o arquivo carrega (ou se falhar)
 * aparece uma caixa em arame no tamanho da pegada. O modelo é ajustado a largura × profundidade × altura.
 */
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

export function buildGlb(url: string, p: ModelParams, onLoaded: () => void): THREE.Group {
  const root = new THREE.Group();
  const placeholder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(p.width, p.height, p.depth)),
    new THREE.LineBasicMaterial({ color: '#e8b34b' }),
  );
  placeholder.position.y = p.height / 2;
  root.add(placeholder);
  root.userData.radius = Math.hypot(p.width, p.depth) / 2;

  let promise = cache.get(url);
  if (!promise) {
    promise = loader.loadAsync(url).then((gltf) => gltf.scene);
    cache.set(url, promise);
  }
  promise
    .then((scene) => {
      const model = scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const k = Math.min(p.width / (size.x || 1), p.height / (size.y || 1), p.depth / (size.z || 1));
      model.scale.setScalar(k);
      box.setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box.min.y, -c.z);
      model.traverse((o) => (o.frustumCulled = false));
      root.remove(placeholder);
      root.add(model);
      onLoaded();
    })
    .catch(() => {
      cache.delete(url);
    });
  return root;
}
