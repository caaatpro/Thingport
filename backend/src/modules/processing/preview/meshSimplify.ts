// Meshes this small aren't worth simplifying and would lose their shape.
const SIMPLIFY_MIN_MESH_TRIANGLES = 2_000;
// Maximum shape deviation as a fraction of the mesh's size.
const SIMPLIFY_MAX_ERROR = 0.01;
const UNUSED_VERTEX = 0xffffffff;

type SimplifiedSummary = { from: number; to: number };

function meshTriangleCount(mesh: import("three").Mesh): number {
  return (mesh.geometry.index?.count ?? 0) / 3;
}

/** Simplifies merged meshes in place when their total exceeds `budget` triangles; null when
 *  already within budget. */
export async function simplifyGroupMeshes(
  root: import("three").Group,
  budget: number,
): Promise<SimplifiedSummary | null> {
  const THREE = await import("three");
  const meshes: InstanceType<typeof THREE.Mesh>[] = [];
  root.traverse((obj) => {
    if ((obj as InstanceType<typeof THREE.Mesh>).isMesh) meshes.push(obj as InstanceType<typeof THREE.Mesh>);
  });
  const total = meshes.reduce((sum, mesh) => sum + meshTriangleCount(mesh), 0);
  if (total <= budget) return null;

  // ESM-only; the CommonJS build's require() loads ES modules from Node 20.19 (see engines).
  const { MeshoptSimplifier } = await import("meshoptimizer");
  await MeshoptSimplifier.ready;

  let after = 0;
  for (const mesh of meshes) {
    const count = meshTriangleCount(mesh);
    const index = mesh.geometry.index;
    if (!index || count <= SIMPLIFY_MIN_MESH_TRIANGLES) {
      after += count;
      continue;
    }
    const target = Math.max(SIMPLIFY_MIN_MESH_TRIANGLES, Math.floor((count * budget) / total));
    const positions = mesh.geometry.getAttribute("position").array as Float32Array;
    const indices = index.array instanceof Uint32Array ? index.array : Uint32Array.from(index.array);
    const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, target * 3, SIMPLIFY_MAX_ERROR, [
      "LockBorder",
    ]);
    // Drop unused vertices so the GLB actually gets smaller.
    const [remap, uniqueVertices] = MeshoptSimplifier.compactMesh(simplified);
    const compacted = new Float32Array(uniqueVertices * 3);
    for (let oldIndex = 0; oldIndex < remap.length; oldIndex++) {
      const newIndex = remap[oldIndex];
      if (newIndex === UNUSED_VERTEX) continue;
      compacted[newIndex * 3] = positions[oldIndex * 3];
      compacted[newIndex * 3 + 1] = positions[oldIndex * 3 + 1];
      compacted[newIndex * 3 + 2] = positions[oldIndex * 3 + 2];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(compacted, 3));
    geometry.setIndex(new THREE.BufferAttribute(simplified, 1));
    geometry.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    after += simplified.length / 3;
  }
  return { from: total, to: after };
}
