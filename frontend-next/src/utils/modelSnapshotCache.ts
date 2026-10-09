// Card-thumbnail snapshots. Jobs run one at a time because many concurrent WebGL contexts are flaky.
import * as THREE from "three";
import type { ResolvedTheme } from "../constants/settingsOptions";
import { applyThemeToObject, disposeObject3D, loadObjectFromAsset, paletteForTheme } from "./modelLoaders";

// Matches the angle the live viewer opens at.
const SNAPSHOT_VIEW_DIRECTION = new THREE.Vector3(0.9, 0.7, 2.1).normalize();

export const snapshotCache = new Map<string, string>();

let snapshotRenderer: THREE.WebGLRenderer | null = null;
let snapshotLock: Promise<void> = Promise.resolve();
let snapshotJobQueue: Promise<void> = Promise.resolve();

export function queueSnapshotJob<T>(job: () => Promise<T>): Promise<T> {
  const result = snapshotJobQueue.then(job, job);
  snapshotJobQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function createSnapshotRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  return renderer;
}

async function acquireSnapshotRenderer() {
  let release!: () => void;
  const wait = snapshotLock;
  snapshotLock = snapshotLock.then(() => new Promise<void>((resolve) => (release = resolve)));
  await wait;
  snapshotRenderer = createSnapshotRenderer();
  const renderer = snapshotRenderer;
  const unlock = () => {
    try {
      renderer.forceContextLoss?.();
      renderer.dispose();
    } catch {}
    snapshotRenderer = null;
    release();
  };
  return { renderer, release: unlock };
}

export async function generateModelSnapshot(
  url: string,
  ext: string,
  width: number,
  height: number,
  theme: ResolvedTheme,
) {
  const normalized = (ext || "").toLowerCase();
  const object = await loadObjectFromAsset(normalized, url);
  if (!object) {
    throw new Error(`Unsupported snapshot extension: ${ext}`);
  }
  applyThemeToObject(object, paletteForTheme(theme));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  // Placeholder near/far, set below from the model's size; fixed values clip very large or small models.
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  const { renderer, release } = await acquireSnapshotRenderer();
  renderer.setSize(width, height, false);
  scene.add(object);

  const box = new THREE.Box3().setFromObject(object);
  if (!box.isEmpty()) {
    // Same framing as ModelViewer's fitCameraToBox.
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.001);
    const padding = 1.15;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distance = padding * Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2));
    camera.position.copy(center).addScaledVector(SNAPSHOT_VIEW_DIRECTION, distance);
    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = distance + radius * 4;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
  } else {
    camera.position.set(1, 1, 3);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
  }

  try {
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    disposeObject3D(object);
    return dataUrl;
  } finally {
    release();
  }
}
