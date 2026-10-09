// Importing this module installs the polyfill.

// Node has no FileReader, but GLTFExporter needs one for its GLB export path.
class NodeFileReader {
  onload?: (e: { target: NodeFileReader }) => void;
  onloadend?: (e: { target: NodeFileReader }) => void;
  onerror?: (e: { target: NodeFileReader }) => void;
  result: ArrayBuffer | string | null = null;
  error: unknown = null;

  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = buf;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((err) => {
        this.error = err;
        this.onerror?.({ target: this });
        this.onloadend?.({ target: this });
      });
  }

  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buf) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`;
        this.onload?.({ target: this });
        this.onloadend?.({ target: this });
      })
      .catch((err) => {
        this.error = err;
        this.onerror?.({ target: this });
        this.onloadend?.({ target: this });
      });
  }
}
if (typeof (globalThis as { FileReader?: unknown }).FileReader === "undefined") {
  (globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
}
