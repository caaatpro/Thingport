import { extOf, stemOf } from "@/utils/fileExtensions";

/** e.g. "Body" / "File 2 · STL". */
export function fileRowText(filename: string, index: number): { primary: string; secondary: string } {
  const type = extOf(filename).toUpperCase();
  return {
    primary: stemOf(filename),
    secondary: type ? `File ${index + 1} · ${type}` : `File ${index + 1}`,
  };
}
