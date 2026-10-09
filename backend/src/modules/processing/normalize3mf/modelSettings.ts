import { IDENTITY } from "./transform";
import { escapeXml, parseAttrs, readMetadata } from "./xml";

// Bambu's Metadata/model_settings.config (object names, extruders, plates) and the configs written back.

export type PartSettings = { id?: string; name: string; extruder: number };
export type ObjectSettings = { id: string; name: string; extruder: number; parts: PartSettings[] };

export function parseModelSettings(xml: string): Record<string, ObjectSettings> {
  const objects: Record<string, ObjectSettings> = {};
  const objectRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi;
  let m;
  while ((m = objectRe.exec(xml))) {
    const id = parseAttrs(m[1]).id;
    if (!id) continue;
    const body = m[2];
    const partAt = body.search(/<part\b/i);
    const meta = readMetadata(partAt >= 0 ? body.slice(0, partAt) : body);
    const objectExtruder = meta.extruder ? Number.parseInt(meta.extruder, 10) : 1;
    const parts: PartSettings[] = [];
    const partRe = /<part\b([^>]*)>([\s\S]*?)<\/part>/gi;
    let p;
    while ((p = partRe.exec(body))) {
      const partMeta = readMetadata(p[2]);
      parts.push({
        id: parseAttrs(p[1]).id,
        name: partMeta.name || "",
        extruder: partMeta.extruder ? Number.parseInt(partMeta.extruder, 10) : objectExtruder,
      });
    }
    objects[id] = { id, name: meta.name || "", extruder: objectExtruder, parts };
  }
  return objects;
}

export type PlateInstance = { objectId: string; instanceId: number; identifyId: string };
export type PlateSettings = { id: string; name: string; instances: PlateInstance[] };

export function parsePlates(xml: string): PlateSettings[] {
  const plates: PlateSettings[] = [];
  const plateRe = /<plate>([\s\S]*?)<\/plate>/gi;
  let m;
  while ((m = plateRe.exec(xml))) {
    const body = m[1];
    const instAt = body.search(/<model_instance/i);
    const meta = readMetadata(instAt >= 0 ? body.slice(0, instAt) : body);
    const instances: PlateInstance[] = [];
    const instRe = /<model_instance>([\s\S]*?)<\/model_instance>/gi;
    let im;
    while ((im = instRe.exec(body))) {
      const imeta = readMetadata(im[1]);
      if (!imeta.object_id) continue;
      instances.push({
        objectId: String(imeta.object_id),
        instanceId: imeta.instance_id != null ? Number.parseInt(imeta.instance_id, 10) || 0 : 0,
        identifyId: imeta.identify_id || "",
      });
    }
    plates.push({ id: meta.plater_id || String(plates.length + 1), name: meta.plater_name || "", instances });
  }
  return plates;
}

export type OutBuildItem = {
  objectid: number;
  transform: string | null;
  printable: string;
  sourceObjectId: string;
  sourceInstanceId: number;
  outInstanceId?: number;
};

export function assignInstancesToPlates(sourcePlates: PlateSettings[], emitted: OutBuildItem[]): PlateSettings[] {
  const remaining = emitted.slice();
  const take = (sourceObjectId: string, sourceInstanceId: number) => {
    const idx = remaining.findIndex(
      (item) => item.sourceObjectId === String(sourceObjectId) && item.sourceInstanceId === sourceInstanceId,
    );
    return idx < 0 ? null : remaining.splice(idx, 1)[0];
  };

  let identify = 1;
  const plates: PlateSettings[] = [];
  for (const plate of sourcePlates) {
    const instances: PlateInstance[] = [];
    for (const inst of plate.instances) {
      const hit = take(inst.objectId, inst.instanceId);
      if (!hit) continue;
      instances.push({
        objectId: String(hit.objectid),
        instanceId: hit.outInstanceId ?? 0,
        identifyId: inst.identifyId || String(identify++),
      });
    }
    if (instances.length) plates.push({ id: String(plates.length + 1), name: plate.name || "", instances });
  }

  if (!plates.length && remaining.length) plates.push({ id: "1", name: "", instances: [] });
  if (remaining.length) {
    const last = plates[plates.length - 1];
    for (const item of remaining) {
      last.instances.push({
        objectId: String(item.objectid),
        instanceId: item.outInstanceId ?? 0,
        identifyId: String(identify++),
      });
    }
  }
  return plates;
}

export type Volume = { name: string; extruder: number; firstid: number; lastid: number };
export type ObjectMeta = { id: number; name: string; extruder: number; volumes: Volume[] };

export function buildModelSettingsConfig(
  objects: ObjectMeta[],
  plates: PlateSettings[],
  assembleItems: OutBuildItem[],
): string {
  const chunks = ['<?xml version="1.0" encoding="UTF-8"?>', "<config>"];
  for (const obj of objects) {
    chunks.push(`  <object id="${obj.id}">`);
    if (obj.name) chunks.push(`    <metadata key="name" value="${escapeXml(obj.name)}"/>`);
    chunks.push(`    <metadata key="extruder" value="${obj.extruder || 1}"/>`);
    const parts = obj.volumes.length ? obj.volumes : [{ name: obj.name, extruder: obj.extruder || 1 }];
    parts.forEach((part, index) => {
      chunks.push(`    <part id="${index + 1}" subtype="normal_part">`);
      if (part.name) chunks.push(`      <metadata key="name" value="${escapeXml(part.name)}"/>`);
      chunks.push(`      <metadata key="extruder" value="${part.extruder || obj.extruder || 1}"/>`);
      chunks.push("    </part>");
    });
    chunks.push("  </object>");
  }
  for (const plate of plates) {
    chunks.push("  <plate>");
    chunks.push(`    <metadata key="plater_id" value="${escapeXml(plate.id || "1")}"/>`);
    chunks.push(`    <metadata key="plater_name" value="${escapeXml(plate.name || "")}"/>`);
    chunks.push(`    <metadata key="locked" value="false"/>`);
    for (const inst of plate.instances) {
      chunks.push("    <model_instance>");
      chunks.push(`      <metadata key="object_id" value="${inst.objectId}"/>`);
      chunks.push(`      <metadata key="instance_id" value="${inst.instanceId}"/>`);
      chunks.push(`      <metadata key="identify_id" value="${escapeXml(inst.identifyId || "1")}"/>`);
      chunks.push("    </model_instance>");
    }
    chunks.push("  </plate>");
  }
  if (assembleItems.length) {
    chunks.push("  <assemble>");
    for (const item of assembleItems) {
      chunks.push(
        `   <assemble_item object_id="${item.objectid}" instance_id="${item.outInstanceId ?? 0}" transform="${escapeXml(item.transform || IDENTITY)}" offset="0 0 0" />`,
      );
    }
    chunks.push("  </assemble>");
  }
  chunks.push("</config>", "");
  return chunks.join("\n");
}

export function buildSlic3rModelConfig(objects: ObjectMeta[]): string {
  const chunks = ['<?xml version="1.0" encoding="UTF-8"?>', "<config>"];
  for (const obj of objects) {
    chunks.push(` <object id="${obj.id}" instancescount="1">`);
    if (obj.name) chunks.push(`  <metadata type="object" key="name" value="${escapeXml(obj.name)}"/>`);
    if (obj.extruder) chunks.push(`  <metadata type="object" key="extruder" value="${obj.extruder}"/>`);
    for (const vol of obj.volumes) {
      chunks.push(`  <volume firstid="${vol.firstid}" lastid="${vol.lastid}">`);
      if (vol.name) chunks.push(`   <metadata type="volume" key="name" value="${escapeXml(vol.name)}"/>`);
      chunks.push(`   <metadata type="volume" key="extruder" value="${vol.extruder || obj.extruder || 1}"/>`);
      chunks.push("  </volume>");
    }
    chunks.push(" </object>");
  }
  chunks.push("</config>", "");
  return chunks.join("\n");
}
