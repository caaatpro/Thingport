import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Spinner } from "@/ui";
import type { ResolvedTheme } from "@/constants/settingsOptions";
import {
  applyThemeToObject,
  disposeObject3D,
  loadBambuThreeMFForViewer,
  loadObjectFromAsset,
  paletteForTheme,
} from "@/utils/modelLoaders";
import { buildBambuModelGroup, loadCachedBambuGlb, type Parsed3MFData, type PlateSummary } from "@/utils/bambuThreeMf";
import markColor from "@/assets/logos/thingport-mark-color.svg";
import markOnDark from "@/assets/logos/thingport-mark-on-dark.svg";
import { createOrientationGizmo } from "./orientationGizmo";
import type { CameraView, ModelViewerHandle, RenderStyle } from "./viewerTypes";

/**
 * The interactive 3D viewer (three.js). Fills its parent, so the parent sets the size. Load it with `React.lazy`.
 * Chrome (plate list, toolbar, zoom buttons) lives outside; see Model3DPreviewModal and PreviewToolbar.
 *
 * Props:
 * - url, ext: the model file (stl, 3mf, obj, step/stp). A Bambu 3MF shows its build plate and internal plates.
 * - theme: "light" | "dark" (scene palette; changing it reloads the model).
 * - viewKey: when set, the camera is saved in localStorage per key and restored on the next open.
 * - colorOverride: hex colour for the material. renderStyle: "solid" | "wire" | "xray".
 * - showBuildPlate / buildPlateForMeshes: bed visibility; draw a default bed under STL/OBJ/STEP.
 * - autoRotate: slow turntable. initialCameraView: preset to frame the model from on load.
 * - selectedPlateId: which internal plate of a 3MF to show (null = all). onPlatesDetected: reports those plates.
 * - previewGlbUrl: server pre-rendered GLB, preferred for 3MF (polled while the server builds it).
 * Ref (ModelViewerHandle): setCameraView(view), zoom(factor), where factor < 1 zooms in.
 */
// Partly adapted (with modifications) from github.com/maziggy/bambuddy, AGPL-3.0-only.

type ModelViewerProps = {
  url: string;
  ext: string;
  viewKey?: string;
  theme: ResolvedTheme;
  /** Overrides the theme-derived material color while keeping the rest of the palette. */
  colorOverride?: string;
  /** For a multi-plate Bambu 3MF: which internal plate to render (null renders all). */
  selectedPlateId?: number | null;
  /** Server pre-rendered GLB, tried before parsing a 3MF client-side. */
  previewGlbUrl?: string | null;
  /** Fired once a 3MF's internal plates are known. `getThumbnail` reuses the fetched bytes. */
  onPlatesDetected?: (plates: PlateSummary[], getThumbnail: (index: number) => Promise<string | null>) => void;
  renderStyle?: RenderStyle;
  showBuildPlate?: boolean;
  /** Draw a default bed under formats that carry no bed size (STL/OBJ/STEP, non-Bambu 3MF). */
  buildPlateForMeshes?: boolean;
  autoRotate?: boolean;
  /** Camera preset to frame the model from on load. Unset keeps per-format defaults. */
  initialCameraView?: CameraView;
};

// Appearance props that change without reloading the model.
type Appearance = Required<Pick<ModelViewerProps, "renderStyle" | "showBuildPlate" | "autoRotate">> & {
  colorOverride?: string;
};

const XRAY_OPACITY = 0.3;

// Bambu X1/P1/A1's 256x256mm bed -- the stand-in for formats with no bed size of their own.
const DEFAULT_BED_SIZE = 256;

type ViewErrorKey = "unsupported" | "failed" | "tooComplex";

// Poll for the server's 3MF preview rather than parsing in the browser: the models that take the
// server longest are the ones that exhaust browser memory.
const SERVER_PREVIEW_POLL_MS = 3000;
const SERVER_PREVIEW_WAIT_MS = 10 * 60 * 1000;

const BAMBU_PLATE_COLOR = 0x00ae42;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Bambu Studio's three-quarter view for multi-plate 3MF; mostly front-on for everything else.
const BAMBU_VIEW_DIRECTION = new THREE.Vector3(0.7, 0.5, 0.7).normalize();
const FRONT_VIEW_DIRECTION = new THREE.Vector3(0.9, 0.7, 2.1).normalize();

// Top/bottom keep a hair of +Z so OrbitControls' up vector isn't parallel to the view direction.
const CAMERA_VIEW_DIRECTIONS: Record<CameraView, THREE.Vector3> = {
  top: new THREE.Vector3(0, 1, 0.0001).normalize(),
  front: new THREE.Vector3(0, 0, 1),
  side: new THREE.Vector3(1, 0, 0),
  bottom: new THREE.Vector3(0, -1, 0.0001).normalize(),
  topFront: new THREE.Vector3(0, 1, 1).normalize(),
};

/** Frames the camera on a bounding box using its circumscribed sphere against both vertical and
 *  horizontal FOV, so the model is never cropped at any aspect or orbit angle. */
function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  controls: any,
  box: THREE.Box3,
  direction: THREE.Vector3 = BAMBU_VIEW_DIRECTION,
  padding = 1.15,
  /** Scenery size (the bed diagonal) the far plane must not clip. */
  sceneryExtent = 0,
): void {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distance = padding * Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2));
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = distance + Math.max(radius * 4, sceneryExtent);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(function ModelViewer(
  {
    url,
    ext,
    viewKey,
    theme,
    colorOverride,
    selectedPlateId = null,
    previewGlbUrl,
    onPlatesDetected,
    renderStyle = "solid",
    showBuildPlate = true,
    autoRotate = false,
    buildPlateForMeshes = false,
    initialCameraView,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const appearanceRef = useRef<Appearance>({ colorOverride, renderStyle, showBuildPlate, autoRotate });
  appearanceRef.current = { colorOverride, renderStyle, showBuildPlate, autoRotate };
  const sceneApiRef = useRef<{
    applyAppearance: () => void;
    setCameraView: (view: CameraView) => void;
    zoom: (factor: number) => void;
  } | null>(null);
  // Lets plate switches rebuild the already-parsed group instead of refetching the file.
  const rebuildBambuPlateRef = useRef<((plateId: number | null) => void) | null>(null);
  const [viewError, setViewError] = useState<ViewErrorKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [waitingForServer, setWaitingForServer] = useState(false);

  useEffect(() => {
    let disposed = false;
    let activeObject: THREE.Object3D | null = null;
    const mount = mountRef.current;
    if (!mount) return;
    const palette = paletteForTheme(theme);
    setViewError(null);
    setIsLoading(true);
    setWaitingForServer(false);
    const reportError = (key: ViewErrorKey) => {
      if (!disposed) {
        setViewError(key);
        setIsLoading(false);
      }
    };

    const scene = new THREE.Scene();
    const initialWidth = mount.clientWidth || 300;
    const initialHeight = mount.clientHeight || 300;
    // A dialog never fires a window resize, so set the real aspect now or framing is wrong.
    const camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(initialWidth, initialHeight);
    // Keeps saturated filament colours from clipping to white under RoomEnvironment's IBL.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;

    // Direction for the front view; turned with the camera's azimuth each frame so the lighting
    // stays put relative to the viewer while orbiting or spinning.
    const KEY_LIGHT_DIRECTION = new THREE.Vector3(60, 260, 90).normalize();
    let keyLightDistance = 280;
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.copy(KEY_LIGHT_DIRECTION).multiplyScalar(keyLightDistance);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    camera.position.set(150, 150, 150);

    let controls: any;
    let teardown: (() => void) | undefined;
    // v2: views saved before the Z-up -> Y-up conversion would orbit the wrong point.
    const storageKey = viewKey ? `ps-view-v2-${viewKey}` : null;

    const loadSavedView = () => {
      if (!storageKey || typeof window === "undefined") return false;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!Array.isArray(data?.position) || !Array.isArray(data?.target)) return false;
        camera.position.fromArray(data.position);
        controls?.target.fromArray(data.target);
        controls?.update();
        return true;
      } catch (err) {
        console.warn("Failed to load saved view", err);
        return false;
      }
    };

    const saveView = () => {
      if (!storageKey || typeof window === "undefined" || !controls) return;
      try {
        const payload = { position: camera.position.toArray(), target: controls.target.toArray() };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {}
    };

    // The tinted plane is unlit and can't receive shadows, so a separate shadow catcher sits above it.
    let buildVolume = { x: DEFAULT_BED_SIZE, y: DEFAULT_BED_SIZE };
    const gridHelper = new THREE.GridHelper(buildVolume.x, Math.ceil(buildVolume.x / 16), 0x444444, 0x333333);
    gridHelper.visible = false;
    scene.add(gridHelper);
    const plateMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(buildVolume.x, buildVolume.y),
      new THREE.MeshBasicMaterial({
        color: BAMBU_PLATE_COLOR,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    plateMesh.rotation.x = -Math.PI / 2;
    plateMesh.position.y = -0.5;
    plateMesh.visible = false;
    scene.add(plateMesh);
    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(buildVolume.x, buildVolume.y),
      new THREE.ShadowMaterial({ opacity: 0.22, depthWrite: false }),
    );
    // The planes are too close for the depth buffer to separate, so without a fixed draw order and
    // no depth writes they z-fight and the shadow flickers as the camera moves.
    shadowCatcher.renderOrder = 1;
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = -0.49;
    shadowCatcher.receiveShadow = true;
    shadowCatcher.visible = false;
    scene.add(shadowCatcher);

    let buildPlateLaidOut = false;
    const syncBuildPlateVisibility = () => {
      const visible = buildPlateLaidOut && appearanceRef.current.showBuildPlate;
      gridHelper.visible = visible;
      plateMesh.visible = visible;
      shadowCatcher.visible = visible;
    };

    const layoutBuildPlate = () => {
      buildPlateLaidOut = true;
      syncBuildPlateVisibility();

      // Covers the plate's diagonal so the rotating shadow frustum never clips it, which flickers.
      const shadowExtent = Math.hypot(buildVolume.x, buildVolume.y) * 0.55;
      keyLightDistance = shadowExtent * 3;
      keyLight.shadow.camera.left = -shadowExtent;
      keyLight.shadow.camera.right = shadowExtent;
      keyLight.shadow.camera.top = shadowExtent;
      keyLight.shadow.camera.bottom = -shadowExtent;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = shadowExtent * 6;
      keyLight.shadow.camera.updateProjectionMatrix();

      gridHelper.geometry.dispose();
      const gridSize = Math.max(buildVolume.x, buildVolume.y);
      const replacement = new THREE.GridHelper(gridSize, Math.ceil(gridSize / 16), 0x444444, 0x333333);
      gridHelper.geometry = replacement.geometry;
      replacement.geometry = new THREE.BufferGeometry();

      plateMesh.geometry.dispose();
      plateMesh.geometry = new THREE.PlaneGeometry(buildVolume.x, buildVolume.y);
      shadowCatcher.geometry.dispose();
      shadowCatcher.geometry = new THREE.PlaneGeometry(buildVolume.x, buildVolume.y);
    };

    // X-ray disables depth writes and backface culling so inner walls show through.
    const applyAppearance = (obj: THREE.Object3D | null) => {
      if (!obj) return;
      const { colorOverride: color, renderStyle: style } = appearanceRef.current;
      const xray = style === "xray";
      obj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = style === "solid";
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          const typed = mat as THREE.MeshStandardMaterial;
          if (color) typed.color?.set(color);
          if (typed.userData.baseSide === undefined) typed.userData.baseSide = typed.side;
          typed.wireframe = style === "wire";
          typed.transparent = xray;
          typed.opacity = xray ? XRAY_OPACITY : 1;
          typed.depthWrite = !xray;
          typed.side = xray ? THREE.DoubleSide : typed.userData.baseSide;
          typed.needsUpdate = true;
        });
      });
    };

    let lastFitBox: THREE.Box3 | null = null;
    // null keeps the per-format default view.
    let presetDirection: THREE.Vector3 | null = initialCameraView ? CAMERA_VIEW_DIRECTIONS[initialCameraView] : null;

    let bambuParsed: Parsed3MFData | null = null;
    let bambuFilamentColors: string[] = [];
    let currentPlateId: number | null = selectedPlateId;
    // A cached GLB already contains every plate, so switching plates is a visibility toggle.
    let cachedGlbRoot: THREE.Group | null = null;

    // Box3.setFromObject ignores visibility, which would measure every plate of a cached GLB.
    const visibleBox = (root: THREE.Object3D): THREE.Box3 => {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      root.traverseVisible((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        box.union(child.geometry.boundingBox!.clone().applyMatrix4(child.matrixWorld));
      });
      return box;
    };

    // An empty box must still clear loading, or the spinner sticks. `refitCamera` frames a newly
    // shown plate instead of restoring the saved view.
    const bedExtent = () => (buildPlateLaidOut ? Math.hypot(buildVolume.x, buildVolume.y) : 0);
    const fitCamera = (box: THREE.Box3, defaultDirection: THREE.Vector3) =>
      fitCameraToBox(camera, controls, box, presetDirection ?? defaultDirection, undefined, bedExtent());

    const finalizeGroupPlacement = (
      group: THREE.Object3D,
      centerOnBuildPlate: boolean,
      refitCamera = false,
      defaultDirection = BAMBU_VIEW_DIRECTION,
    ) => {
      const box = visibleBox(group);
      if (box.isEmpty()) {
        setIsLoading(false);
        return;
      }
      // Relative offsets: the reused cached-GLB root still carries the previous plate's offset.
      const center = box.getCenter(new THREE.Vector3());
      group.position.y -= box.min.y;
      if (centerOnBuildPlate) {
        group.position.x += buildVolume.x / 2 - center.x;
        group.position.z += buildVolume.y / 2 - center.z;
      }
      plateMesh.position.set(buildVolume.x / 2, plateMesh.position.y, buildVolume.y / 2);
      shadowCatcher.position.set(buildVolume.x / 2, shadowCatcher.position.y, buildVolume.y / 2);
      gridHelper.position.set(buildVolume.x / 2, 0, buildVolume.y / 2);

      const finalBox = visibleBox(group);
      lastFitBox = finalBox;
      if (refitCamera || !loadSavedView()) fitCamera(finalBox, defaultDirection);
      setIsLoading(false);
    };

    const renderBambuGroup = (centerOnBuildPlate: boolean, refitCamera = false) => {
      if (!bambuParsed) return;
      if (activeObject) {
        scene.remove(activeObject);
        disposeObject3D(activeObject);
      }
      const group = buildBambuModelGroup(bambuParsed, currentPlateId, bambuFilamentColors);
      applyAppearance(group);
      activeObject = group;
      scene.add(group);
      finalizeGroupPlacement(group, centerOnBuildPlate, refitCamera);
    };

    const showCachedGlbPlate = (plateId: number | null, centerOnBuildPlate: boolean, refitCamera = false) => {
      if (!cachedGlbRoot) return;
      const targetName = plateId != null ? `plate-${plateId}` : null;
      let matched = false;
      cachedGlbRoot.children.forEach((child) => {
        const visible = !targetName || child.name === targetName;
        child.visible = visible;
        if (visible) matched = true;
      });
      if (!matched)
        cachedGlbRoot.children.forEach((child) => {
          child.visible = true;
        });
      finalizeGroupPlacement(cachedGlbRoot, centerOnBuildPlate, refitCamera);
    };

    (async () => {
      try {
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enablePan = true;
        controls.target.set(0, 50, 0);
        // Only a user's own drag/zoom is worth saving; auto-rotate fires "change" every frame.
        controls.addEventListener("end", saveView);

        const showMeshObject = (obj: THREE.Object3D) => {
          applyThemeToObject(obj, palette);
          applyAppearance(obj);
          activeObject = obj;
          scene.add(obj);
          const box = visibleBox(obj);
          if (buildPlateForMeshes && !box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            buildVolume = {
              x: Math.max(DEFAULT_BED_SIZE, Math.ceil(size.x * 1.1)),
              y: Math.max(DEFAULT_BED_SIZE, Math.ceil(size.z * 1.1)),
            };
            layoutBuildPlate();
            finalizeGroupPlacement(obj, true, false, FRONT_VIEW_DIRECTION);
            return;
          }
          setIsLoading(false);
          if (box.isEmpty()) return;
          lastFitBox = box;
          if (!loadSavedView()) fitCamera(box, FRONT_VIEW_DIRECTION);
        };

        const e = (ext || "").toLowerCase();

        // Returns false when the caller should parse the raw file in the browser instead.
        const tryLoadCachedGlb = async (): Promise<boolean> => {
          if (!previewGlbUrl) return false;
          const deadline = Date.now() + SERVER_PREVIEW_WAIT_MS;
          let outcome = await loadCachedBambuGlb(previewGlbUrl);
          while (outcome.status === "generating") {
            if (disposed) return true;
            if (Date.now() > deadline) {
              reportError("failed");
              return true;
            }
            setWaitingForServer(true);
            await new Promise((resolve) => setTimeout(resolve, SERVER_PREVIEW_POLL_MS));
            if (disposed) return true;
            outcome = await loadCachedBambuGlb(previewGlbUrl);
          }
          if (disposed) return true;
          setWaitingForServer(false);
          if (outcome.status === "failed") {
            reportError("tooComplex");
            return true;
          }
          if (outcome.status !== "ready") return false;
          const cached = outcome.glb;
          cachedGlbRoot = cached.rootGroup;
          buildVolume = cached.buildVolume;
          layoutBuildPlate();
          applyAppearance(cachedGlbRoot);
          activeObject = cachedGlbRoot;
          scene.add(cachedGlbRoot);
          if (currentPlateId == null && cached.plates.length > 0) currentPlateId = cached.plates[0].index;
          onPlatesDetected?.(cached.plates, cached.getPlateThumbnail);
          showCachedGlbPlate(currentPlateId, true);
          return true;
        };

        try {
          if (e === "3mf") {
            if (disposed) return;
            const usedCache = await tryLoadCachedGlb();
            if (!usedCache && !disposed) {
              const result = await loadBambuThreeMFForViewer(url);
              if (!result) {
                const obj = await loadObjectFromAsset(e, url);
                if (!obj) {
                  reportError("unsupported");
                  return;
                }
                if (disposed) {
                  disposeObject3D(obj);
                  return;
                }
                showMeshObject(obj);
              } else if (!disposed) {
                bambuParsed = result.parsedData;
                bambuFilamentColors = result.filamentColors;
                buildVolume = result.buildVolume;
                layoutBuildPlate();
                if (currentPlateId == null && result.plates.length > 0) currentPlateId = result.plates[0].index;
                onPlatesDetected?.(result.plates, result.getPlateThumbnail);
                renderBambuGroup(true);
              }
            }
          } else {
            const obj = await loadObjectFromAsset(e, url);
            if (!obj) {
              reportError("unsupported");
              return;
            }
            if (disposed) {
              disposeObject3D(obj);
              return;
            }
            showMeshObject(obj);
          }
        } catch (err) {
          console.error("Viewer asset load failed:", err);
          reportError("failed");
        }
      } catch (err) {
        console.error("Viewer init failed:", err);
      }

      // StrictMode can dispose this instance before we get here.
      if (disposed) return;

      let width = mount.clientWidth || 300;
      let height = mount.clientHeight || 300;
      const onResize = () => {
        if (!mount) return;
        width = mount.clientWidth || 300;
        height = mount.clientHeight || 300;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);
      const gizmo = createOrientationGizmo(renderer);
      teardown = () => {
        window.removeEventListener("resize", onResize);
        gizmo.dispose();
      };

      // Eased toward over a few frames so button zooms don't jump.
      let zoomTargetDistance: number | null = null;
      const zoomOffset = new THREE.Vector3();
      const stepZoom = () => {
        if (zoomTargetDistance === null || !controls) return;
        zoomOffset.subVectors(camera.position, controls.target);
        const current = zoomOffset.length();
        const next = THREE.MathUtils.lerp(current, zoomTargetDistance, 0.25);
        if (Math.abs(next - zoomTargetDistance) < zoomTargetDistance * 0.001) zoomTargetDistance = null;
        camera.position.copy(controls.target).addScaledVector(zoomOffset.normalize(), next);
        // fitCameraToBox sized near/far for the fitted distance; shift them so zooming out doesn't clip.
        camera.near = Math.max(next / 1000, 0.01);
        camera.far += next - current;
        camera.updateProjectionMatrix();
      };
      // A drag or wheel zoom takes over from an unfinished button zoom.
      controls?.addEventListener("start", () => {
        zoomTargetDistance = null;
      });

      const animate = () => {
        if (disposed) return;
        stepZoom();
        if (controls) controls.autoRotate = appearanceRef.current.autoRotate;
        controls?.update();
        if (controls) {
          // Aim at the plate centre: the shadow frustum is centred on the light's target.
          keyLight.target.position.set(plateMesh.position.x, 0, plateMesh.position.z);
          keyLight.position
            .copy(KEY_LIGHT_DIRECTION)
            .applyAxisAngle(Y_AXIS, controls.getAzimuthalAngle())
            .multiplyScalar(keyLightDistance)
            .add(keyLight.target.position);
        }
        renderer.render(scene, camera);
        gizmo.render(camera, controls?.target ?? new THREE.Vector3(), width, height);
        requestAnimationFrame(animate);
      };
      animate();

      sceneApiRef.current = {
        applyAppearance: () => {
          applyAppearance(activeObject);
          syncBuildPlateVisibility();
        },
        zoom: (factor) => {
          if (!controls) return;
          const from = zoomTargetDistance ?? camera.position.distanceTo(controls.target);
          zoomTargetDistance = THREE.MathUtils.clamp(from * factor, controls.minDistance, controls.maxDistance);
        },
        setCameraView: (view) => {
          zoomTargetDistance = null;
          presetDirection = CAMERA_VIEW_DIRECTIONS[view];
          if (lastFitBox && controls) {
            fitCameraToBox(camera, controls, lastFitBox, CAMERA_VIEW_DIRECTIONS[view], undefined, bedExtent());
          }
        },
      };

      rebuildBambuPlateRef.current = (plateId) => {
        if (plateId === currentPlateId) return;
        currentPlateId = plateId;
        if (cachedGlbRoot) showCachedGlbPlate(plateId, true, true);
        else renderBambuGroup(true, true);
      };
    })();

    return () => {
      disposed = true;
      try {
        teardown?.();
        mount.removeChild(renderer.domElement);
      } catch {}
      if (activeObject) {
        disposeObject3D(activeObject);
      }
      try {
        controls?.removeEventListener("end", saveView);
        controls?.dispose();
      } catch {}
      try {
        environment.texture.dispose();
        pmrem.dispose();
      } catch {}
      try {
        renderer.forceContextLoss?.();
      } catch {}
      renderer.dispose();
      rebuildBambuPlateRef.current = null;
      sceneApiRef.current = null;
    };
    // Only the initial plate/camera view are read here; later changes go through the lighter effects
    // below so they don't re-parse the model (onPlatesDetected is also an unmemoized prop).
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ext, viewKey, theme, previewGlbUrl]);

  useEffect(() => {
    rebuildBambuPlateRef.current?.(selectedPlateId ?? null);
  }, [selectedPlateId]);

  useEffect(() => {
    sceneApiRef.current?.applyAppearance();
  }, [colorOverride, renderStyle, showBuildPlate, autoRotate]);

  useImperativeHandle(
    ref,
    () => ({
      setCameraView: (view) => sceneApiRef.current?.setCameraView(view),
      zoom: (factor) => sceneApiRef.current?.zoom(factor),
    }),
    [],
  );

  return (
    <div ref={mountRef} className="relative size-full overflow-hidden bg-canvas">
      {isLoading && !viewError && (
        <output className="absolute inset-0 flex items-center justify-center bg-canvas">
          <div className="flex flex-col items-center gap-3">
            <img src={theme === "dark" ? markOnDark : markColor} alt="" className="h-9 w-auto" />
            <Spinner label="Loading 3D preview" className="size-5.5" />
            {waitingForServer && (
              <p className="px-4 text-center text-xs text-muted">
                Preparing the 3D preview… Large models can take a minute.
              </p>
            )}
          </div>
        </output>
      )}
      {viewError && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center bg-canvas px-4 text-center">
          <p className="text-sm font-medium text-danger">
            {viewError === "unsupported"
              ? "Preview unsupported for this file type."
              : viewError === "tooComplex"
                ? "This model is too complex for a 3D preview."
                : "Preview failed to load."}
          </p>
        </div>
      )}
    </div>
  );
});

export default ModelViewer;
