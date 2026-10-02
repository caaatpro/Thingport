// occt-import-js ships no type declarations; the real shape is cast at the call site.
declare module "occt-import-js" {
  const initOcct: (opts?: unknown) => Promise<unknown>;
  export default initOcct;
}
