export type RenderStyle = "solid" | "wire" | "xray";
export type CameraView = "top" | "front" | "side" | "bottom" | "topFront";

/** A camera preset is a one-off action (clicking "Top" twice re-frames twice), not state. */
export type ModelViewerHandle = {
  setCameraView: (view: CameraView) => void;
  /** Scales the camera's distance to the orbit target: below 1 zooms in, above 1 zooms out. */
  zoom: (factor: number) => void;
};
