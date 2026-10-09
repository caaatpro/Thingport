export function isFileDrag(e: { dataTransfer?: DataTransfer | null }): boolean {
  const types = Array.from(e.dataTransfer?.types || []);
  return types.includes("Files");
}
