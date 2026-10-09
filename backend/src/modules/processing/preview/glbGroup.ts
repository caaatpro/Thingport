import { applyAffineToVertices } from "./meshes";
import type { ParsedModel } from "./parse";

type PlateSummary = { index: number; name: string | null; objectCount: number };

/** Merges meshes per (plate, extruder), so the viewer only toggles plate visibility. */
export async function buildGlbGroup(parsed: ParsedModel): Promise<import("three").Group> {
  const THREE = await import("three");
  const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");

  const objectCountByPlate = new Map<number, number>();
  for (const item of parsed.buildItems) {
    if (item.plateId == null) continue;
    objectCountByPlate.set(item.plateId, (objectCountByPlate.get(item.plateId) ?? 0) + 1);
  }
  const plateIndexes = Array.from(objectCountByPlate.keys()).toSorted((a, b) => a - b);
  const hasPlateAssignments = plateIndexes.length > 0;
  // No plate metadata: put everything under a synthetic plate 0.
  const effectivePlateIndexes = hasPlateAssignments ? plateIndexes : [0];

  const root = new THREE.Group();
  root.name = "thingport-preview-root";

  const plates: PlateSummary[] = [];
  for (const plateIndex of effectivePlateIndexes) {
    const itemsForPlate = hasPlateAssignments
      ? parsed.buildItems.filter((item) => item.plateId === plateIndex)
      : parsed.buildItems;

    const geometriesByExtruder = new Map<number, InstanceType<typeof THREE.BufferGeometry>[]>();
    for (const item of itemsForPlate) {
      const objectData = parsed.objects.get(item.objectId);
      if (!objectData) continue;
      for (const mesh of objectData.meshes) {
        const positioned = item.transform ? applyAffineToVertices(mesh.vertices, item.transform) : mesh.vertices;
        // 3MF Z-up -> three.js Y-up, matching bambuThreeMf.ts's createGeometryFromMesh.
        // Changing this changes every cached GLB: bump PREVIEW_FORMAT_VERSION.
        const swapped = new Float32Array(positioned.length);
        for (let i = 0; i < positioned.length; i += 3) {
          swapped[i] = positioned[i];
          swapped[i + 1] = positioned[i + 2];
          swapped[i + 2] = -positioned[i + 1];
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(swapped, 3));
        geometry.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
        geometry.computeVertexNormals();
        if (!geometriesByExtruder.has(mesh.extruder)) geometriesByExtruder.set(mesh.extruder, []);
        geometriesByExtruder.get(mesh.extruder)!.push(geometry);
      }
    }

    const plateGroup = new THREE.Group();
    plateGroup.name = `plate-${plateIndex}`;
    // Every plate stays visible: GLTFExporter drops invisible nodes by default.
    let objectCount = 0;
    const fallbackColor = new THREE.Color(0xdddddd);
    for (const [extruder, geometries] of geometriesByExtruder) {
      if (geometries.length === 0) continue;
      // Type-only mismatch between mergeGeometries' .d.ts and the dynamically imported three.
      const merged =
        geometries.length === 1
          ? geometries[0]
          : (mergeGeometries(geometries as never, false) as InstanceType<typeof THREE.BufferGeometry> | null);
      if (merged) {
        const colorStr = parsed.filamentColors[extruder];
        const color = colorStr ? new THREE.Color(colorStr) : fallbackColor;
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.0 });
        const mesh = new THREE.Mesh(merged as never, material);
        mesh.name = `extruder-${extruder}`;
        plateGroup.add(mesh);
        objectCount++;
      }
      if (geometries.length > 1) geometries.forEach((g) => g.dispose());
    }
    root.add(plateGroup);
    plates.push({ index: plateIndex, name: parsed.plateNames.get(plateIndex) ?? null, objectCount });
  }

  root.userData = {
    thingportPreview: JSON.stringify({
      plates,
      plateThumbnails: Object.fromEntries(parsed.plateThumbnails),
      filamentColors: parsed.filamentColors,
      buildVolume: parsed.buildVolume,
    }),
  };

  return root;
}
