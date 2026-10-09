import { decodePaintState, encodePaintState, stateToMaterialIndex } from "./paint";
import type { Volume } from "./modelSettings";
import { formatNumber, transformPoint } from "./transform";
import { escapeXml, parseAttrs } from "./xml";

export type Part = { name: string; extruder: number; body: string; localTransform: string };
type Triangle = { v1: number; v2: number; v3: number; paint: string; p1: number | null };

function parseMeshGeometry(body: string): { vertices: number[][]; triangles: Triangle[] } {
  const vertices: number[][] = [];
  const vRe = /<vertex\b([^>]*)\/?>/gi;
  let m;
  while ((m = vRe.exec(body))) {
    const a = parseAttrs(m[1]);
    vertices.push([Number.parseFloat(a.x) || 0, Number.parseFloat(a.y) || 0, Number.parseFloat(a.z) || 0]);
  }
  const triangles: Triangle[] = [];
  const tRe = /<triangle\b([^>]*)\/?>/gi;
  while ((m = tRe.exec(body))) {
    const a = parseAttrs(m[1]);
    triangles.push({
      v1: Number.parseInt(a.v1, 10),
      v2: Number.parseInt(a.v2, 10),
      v3: Number.parseInt(a.v3, 10),
      paint: a.paint_color || "",
      p1: a.p1 != null && a.p1 !== "" ? Number.parseInt(a.p1, 10) : null,
    });
  }
  return { vertices, triangles };
}

/** Bakes an assembly's parts into one mesh, painting each part in its own filament so colors survive
 *  slicers that ignore per-volume extruders. */
export function mergePartsToMesh(parts: Part[], materialsId: number, colors: unknown[]): { body: string; volumes: Volume[] } {
  const vertexLines: string[] = [];
  const triangleLines: string[] = [];
  const volumes: Volume[] = [];
  let vOffset = 0;
  let tOffset = 0;
  const paletteSize = colors.length || 1;

  for (const part of parts) {
    const geom = parseMeshGeometry(part.body);
    for (const vertex of geom.vertices) {
      const p = transformPoint(vertex, part.localTransform);
      vertexLines.push(`     <vertex x="${formatNumber(p[0])}" y="${formatNumber(p[1])}" z="${formatNumber(p[2])}"/>`);
    }
    const defaultIdx = stateToMaterialIndex(0, part.extruder, paletteSize);
    for (const tri of geom.triangles) {
      let idx = defaultIdx;
      if (tri.p1 !== null && Number.isInteger(tri.p1)) idx = Math.min(Math.max(tri.p1, 0), paletteSize - 1);
      else if (tri.paint) idx = stateToMaterialIndex(decodePaintState(tri.paint), part.extruder, paletteSize);
      const paint = tri.paint || encodePaintState(part.extruder);
      let extra = ` pid="${materialsId}" p1="${idx}"`;
      if (paint) extra += ` paint_color="${escapeXml(paint)}" slic3rpe:mmu_segmentation="${escapeXml(paint)}"`;
      triangleLines.push(
        `     <triangle v1="${tri.v1 + vOffset}" v2="${tri.v2 + vOffset}" v3="${tri.v3 + vOffset}"${extra}/>`,
      );
    }
    const tCount = geom.triangles.length;
    if (tCount > 0)
      volumes.push({ name: part.name, extruder: part.extruder, firstid: tOffset, lastid: tOffset + tCount - 1 });
    vOffset += geom.vertices.length;
    tOffset += tCount;
  }

  return {
    body:
      "\n   <mesh>\n    <vertices>\n" +
      vertexLines.join("\n") +
      "\n    </vertices>\n    <triangles>\n" +
      triangleLines.join("\n") +
      "\n    </triangles>\n   </mesh>\n  ",
    volumes,
  };
}
