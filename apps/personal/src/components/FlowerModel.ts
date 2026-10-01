import { Box3, DoubleSide, Group, Mesh, OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export interface FlowerModel {
  resize(width: number, height: number): void;
  render(angle: number, pinkStart: number, pinkInk: number[]): void;
  frontBounds(): { width: number; height: number };
  dispose(): void;
}

const disposeModel = (model: Group) => model.traverse(object => {
  if (!(object instanceof Mesh)) return;
  object.geometry.dispose();
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  materials.forEach(material => material.dispose());
});

export async function createFlowerModel(canvas: HTMLCanvasElement, modelSrc: string, signal: AbortSignal): Promise<FlowerModel> {
  const response = await fetch(modelSrc, { signal });
  if (!response.ok) throw new Error(`Flower model request failed: ${response.status}`);
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
  if (signal.aborted) { disposeModel(gltf.scene); throw new DOMException("Aborted", "AbortError"); }

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (error) {
    disposeModel(gltf.scene);
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1.02, -1.02, .1, 20);
  camera.position.z = 5;

  // Neutral ink keeps the existing difference effect; subtle edge shading reveals depth.
  // The shader splits at the pink section's edge in screen space, independent of rotation.
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      resolution: { value: new Vector2() },
      pinkStart: { value: 1 },
      pinkInk: { value: new Vector3() }
    },
    vertexShader: `
      varying vec3 surfaceNormal;
      void main() {
        surfaceNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec2 resolution;
      uniform float pinkStart;
      uniform vec3 pinkInk;
      varying vec3 surfaceNormal;
      void main() {
        float fromTop = 1.0 - gl_FragCoord.y / resolution.y;
        float shade = 0.82 + 0.18 * abs(normalize(surfaceNormal).z);
        vec3 ink = fromTop >= pinkStart ? pinkInk : vec3(shade);
        gl_FragColor = vec4(ink, 1.0);
      }
    `
  });
  gltf.scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const oldMaterials = Array.isArray(object.material) ? object.material : [object.material];
    oldMaterials.forEach(old => old.dispose());
    object.material = material;
  });
  const bounds = new Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new Vector3());
  gltf.scene.position.sub(bounds.getCenter(new Vector3()));
  const coin = new Group();
  coin.add(gltf.scene);
  coin.scale.setScalar(2 / size.y);
  scene.add(coin);
  let height = 1;
  let width = 1;

  return {
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
      camera.left = -1.02 * width / height;
      camera.right = 1.02 * width / height;
      camera.updateProjectionMatrix();
      renderer.getDrawingBufferSize(material.uniforms.resolution.value);
    },
    render(angle, pinkStart, pinkInk) {
      coin.rotation.y = angle;
      material.uniforms.pinkStart.value = pinkStart / height;
      material.uniforms.pinkInk.value.set(...pinkInk.map(channel => channel / 255) as [number, number, number]);
      renderer.render(scene, camera);
    },
    frontBounds() {
      return { width: (size.x / size.y) * height / (1.02 * width), height: 1 / 1.02 };
    },
    dispose() {
      disposeModel(gltf.scene);
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
