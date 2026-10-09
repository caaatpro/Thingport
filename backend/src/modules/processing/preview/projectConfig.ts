import * as cheerio from "cheerio";

// Bambu's Metadata/model_settings.config and project_settings.config, as far as the preview needs them.

export type StructuralData = {
  extruderMapById: Map<string, number>;
  partExtruderMap: Map<string, number>;
  objectNameById: Map<string, string>;
  plateAssignmentsByObjectId: Map<string, number>;
  plateNames: Map<number, string>;
  plateOffsets: Map<number, { offsetX: number; offsetY: number }>;
};

export function parseModelSettingsConfig(xml: string): StructuralData {
  const data: StructuralData = {
    extruderMapById: new Map(),
    partExtruderMap: new Map(),
    objectNameById: new Map(),
    plateAssignmentsByObjectId: new Map(),
    plateNames: new Map(),
    plateOffsets: new Map(),
  };
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xml: true });
  } catch {
    return data;
  }

  $("object").each((_i, objEl) => {
    const $obj = $(objEl);
    const objectId = $obj.attr("id");
    if (!objectId) return;

    const extruderMeta = $obj.children('metadata[key="extruder"]').first();
    const extruderVal = extruderMeta.attr("value");
    if (extruderVal) data.extruderMapById.set(objectId, Math.max(0, parseInt(extruderVal, 10) - 1));

    const nameVal = $obj.children('metadata[key="name"]').first().attr("value");
    if (nameVal) data.objectNameById.set(objectId, nameVal);

    $obj.find("part").each((_j, partEl) => {
      const $part = $(partEl);
      const partId = $part.attr("id");
      if (!partId) return;
      const partExtruderVal = $part.children('metadata[key="extruder"]').first().attr("value");
      if (partExtruderVal)
        data.partExtruderMap.set(`${objectId}:${partId}`, Math.max(0, parseInt(partExtruderVal, 10) - 1));
    });
  });

  $("plate").each((_i, plateEl) => {
    const $plate = $(plateEl);
    let plateId: number | null = null;
    let offsetX = 0;
    let offsetY = 0;
    let plateName: string | undefined;
    $plate.find("> metadata").each((_j, metaEl) => {
      const $meta = $(metaEl);
      const key = $meta.attr("key");
      const value = $meta.attr("value");
      if ((key === "plater_id" || key === "plate_id") && value) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) plateId = parsed;
      } else if (key === "pos_x" && value) {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) offsetX = parsed;
      } else if (key === "pos_y" && value) {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) offsetY = parsed;
      } else if (key === "plater_name" && value?.trim()) {
        plateName = value.trim();
      }
    });
    if (plateId == null) return;
    if (offsetX !== 0 || offsetY !== 0) data.plateOffsets.set(plateId, { offsetX, offsetY });
    if (plateName) data.plateNames.set(plateId, plateName);

    $plate.find("model_instance").each((_j, instEl) => {
      const objectIdVal = $(instEl).children('metadata[key="object_id"]').first().attr("value");
      if (objectIdVal) data.plateAssignmentsByObjectId.set(objectIdVal, plateId as number);
    });
  });

  return data;
}

export function parseProjectSettingsJson(text: string): {
  filamentColors: string[];
  buildVolume: { x: number; y: number } | null;
} {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const filamentColors = Array.isArray(json.filament_colour)
      ? json.filament_colour.filter((c): c is string => typeof c === "string")
      : [];
    let buildVolume: { x: number; y: number } | null = null;
    const area = json.printable_area;
    if (Array.isArray(area) && area.length >= 3 && typeof area[2] === "string") {
      const match = area[2].match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
      if (match) buildVolume = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    }
    return { filamentColors, buildVolume };
  } catch {
    return { filamentColors: [], buildVolume: null };
  }
}
