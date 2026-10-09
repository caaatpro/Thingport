// Bambu/Orca project settings: which survive, and how they map onto PrusaSlicer (Slic3r) keys.

export type Settings = Record<string, unknown>;

const BAMBU_TO_SLIC3R: Record<string, string> = {
  layer_height: "layer_height",
  initial_layer_print_height: "first_layer_height",
  wall_loops: "perimeters",
  top_shell_layers: "top_solid_layers",
  bottom_shell_layers: "bottom_solid_layers",
  top_shell_thickness: "top_solid_min_thickness",
  bottom_shell_thickness: "bottom_solid_min_thickness",
  sparse_infill_density: "fill_density",
  sparse_infill_pattern: "fill_pattern",
  line_width: "extrusion_width",
  outer_wall_line_width: "external_perimeter_extrusion_width",
  inner_wall_line_width: "perimeter_extrusion_width",
  initial_layer_line_width: "first_layer_extrusion_width",
  sparse_infill_line_width: "infill_extrusion_width",
  internal_solid_infill_line_width: "solid_infill_extrusion_width",
  top_surface_line_width: "top_infill_extrusion_width",
  support_line_width: "support_material_extrusion_width",
  enable_support: "support_material",
  support_threshold_angle: "support_material_threshold",
  support_on_build_plate_only: "support_material_buildplate_only",
  support_object_xy_distance: "support_material_xy_spacing",
  support_top_z_distance: "support_material_contact_distance",
  raft_layers: "raft_layers",
  brim_width: "brim_width",
  brim_type: "brim_type",
  skirt_loops: "skirts",
  skirt_distance: "skirt_distance",
  skirt_height: "skirt_height",
  detect_thin_wall: "thin_walls",
  wall_generator: "perimeter_generator",
  infill_wall_overlap: "infill_overlap",
  infill_direction: "fill_angle",
  ironing_type: "ironing",
  ironing_flow: "ironing_flowrate",
  ironing_spacing: "ironing_spacing",
  filament_colour: "filament_colour",
  filament_type: "filament_type",
  filament_diameter: "filament_diameter",
  filament_density: "filament_density",
  filament_flow_ratio: "extrusion_multiplier",
  filament_max_volumetric_speed: "filament_max_volumetric_speed",
  nozzle_temperature: "temperature",
  nozzle_temperature_initial_layer: "first_layer_temperature",
  hot_plate_temp: "bed_temperature",
  hot_plate_temp_initial_layer: "first_layer_bed_temperature",
  fan_max_speed: "max_fan_speed",
  fan_min_speed: "min_fan_speed",
  retraction_length: "retract_length",
  retraction_speed: "retract_speed",
  elefant_foot_compensation: "elefant_foot_compensation",
  resolution: "resolution",
  spiral_mode: "spiral_vase",
  ensure_vertical_shell_thickness: "ensure_vertical_shell_thickness",
  top_surface_pattern: "top_fill_pattern",
  bottom_surface_pattern: "bottom_fill_pattern",
  support_interface_pattern: "support_material_interface_pattern",
  support_base_pattern: "support_material_pattern",
  support_interface_top_layers: "support_material_interface_layers",
  tree_support_branch_angle: "support_tree_angle",
  tree_support_branch_diameter: "support_tree_branch_diameter",
  tree_support_branch_distance: "support_tree_branch_distance",
};

const PATTERN_MAP: Record<string, string> = {
  crosshatch: "grid",
  "zig-zag": "zigzag",
  zigzag: "zigzag",
};

// Printer/machine profile keys: they'd drag the designer's Bambu printer into the other slicer.
const STRIP_SETTING_KEYS = new Set([
  "printer_model",
  "printer_settings_id",
  "printer_variant",
  "printer_notes",
  "printer_structure",
  "printer_technology",
  "printer_extruder_id",
  "printer_extruder_variant",
  "print_compatible_printers",
  "upward_compatible_machine",
  "printable_area",
  "printable_height",
  "bed_exclude_area",
  "bed_custom_model",
  "bed_custom_texture",
  "gcode_flavor",
  "host_type",
  "printhost_authorization_type",
  "printhost_ssl_ignore_revoke",
  "scan_first_layer",
  "silent_mode",
  "thumbnail_size",
  "default_print_profile",
  "default_filament_profile",
  "print_settings_id",
  "from",
  "filename_format",
  "extruder_printable_area",
  "extruder_printable_height",
  "head_wrap_detect_zone",
  "wrapping_exclude_area",
  "nozzle_type",
  "nozzle_volume",
  "nozzle_volume_type",
  "nozzle_height",
  "auxiliary_fan",
  "extruder_ams_count",
  "extruder_type",
  "extruder_variant_list",
  "extruder_max_nozzle_count",
  "extruder_nozzle_stats",
  "extruder_offset",
  "extruder_clearance_dist_to_rod",
  "extruder_clearance_height_to_lid",
  "extruder_clearance_height_to_rod",
  "extruder_clearance_max_radius",
  "physical_extruder_map",
  "print_extruder_id",
  "print_extruder_variant",
  "master_extruder_id",
  "has_filament_switcher",
  "default_nozzle_volume_type",
  "machine_bed_mass_Y",
  "machine_hotend_change_time",
  "machine_load_filament_time",
  "machine_max_printed_mass",
  "machine_max_force_Y",
  "machine_prepare_compensation_time",
  "machine_switch_extruder_time",
  "machine_unload_filament_time",
  "template_custom_gcode",
  "post_process",
  "curr_bed_type",
  "filament_settings_id",
  "filament_ids",
  "filament_extruder_compatibility",
  "filament_extruder_variant",
  "filament_map",
  "filament_map_mode",
  "filament_volume_map",
  "filament_nozzle_map",
  "use_relative_e_distances",
  "use_firmware_retraction",
  "use_volumetric_e",
  "default_ams_type",
]);

const FILAMENT_SLOT_KEYS = new Set([
  "wall_filament",
  "solid_infill_filament",
  "sparse_infill_filament",
  "support_filament",
  "support_interface_filament",
]);

const VERTICAL_SHELL_MAP: Record<string, string> = {
  enabled: "ensure_all",
  "1": "ensure_all",
  true: "ensure_all",
  disabled: "disabled",
  "0": "disabled",
  false: "disabled",
  none: "disabled",
  partial: "ensure_moderate",
};

const FILAMENT_ARRAY_KEYS = new Set([
  "filament_colour",
  "filament_type",
  "filament_diameter",
  "filament_density",
  "filament_flow_ratio",
  "filament_max_volumetric_speed",
  "nozzle_temperature",
  "nozzle_temperature_initial_layer",
  "hot_plate_temp",
  "hot_plate_temp_initial_layer",
  "fan_max_speed",
  "fan_min_speed",
  "retraction_length",
  "retraction_speed",
]);

const BOOLEAN_KEYS = new Set(["enable_support", "detect_thin_wall", "spiral_mode", "support_on_build_plate_only"]);

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function slic3rSerialize(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(";");
  if (value === true) return "1";
  if (value === false) return "0";
  return String(value);
}

function mapFillPattern(pattern: unknown): unknown {
  if (pattern == null) return pattern;
  return PATTERN_MAP[String(pattern).toLowerCase()] || pattern;
}

function shouldStripSettingKey(key: string): boolean {
  if (STRIP_SETTING_KEYS.has(key)) return true;
  if (key.startsWith("machine_max_") || key.startsWith("machine_min_")) return true;
  if (key.endsWith("_gcode")) return true;
  return key.startsWith("printhost_");
}

// "nil" and -1 mean "inherit from the profile" in Bambu; other slicers read them literally.
function isSentinelSettingToken(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim().toLowerCase();
  return s === "nil" || s === "-1";
}

function normalizeSettingValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (!value.length || value.some(isSentinelSettingToken)) return undefined;
    return value;
  }
  return isSentinelSettingToken(value) ? undefined : value;
}

function isUnsetFilamentSlot(key: string, value: unknown): boolean {
  if (!FILAMENT_SLOT_KEYS.has(key)) return false;
  const n = Number(firstValue(value));
  return !Number.isFinite(n) || n < 1;
}

function mapVerticalShellThickness(value: unknown): unknown {
  const raw = String(firstValue(value)).trim().toLowerCase();
  return VERTICAL_SHELL_MAP[raw] || firstValue(value);
}

export function extractBambuSettings(config: unknown): Settings {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const settings = config as Settings;
  const processSettings = settings.process_settings as Record<string, unknown> | undefined;
  if (processSettings && typeof processSettings === "object") {
    const nested = processSettings["1"];
    if (nested && typeof nested === "object") return { ...settings, ...(nested as Settings) };
  }
  return settings;
}

function syncExtruderColours(out: Settings): void {
  const filaments = asArray(out.filament_colour);
  const extruders = asArray(out.extruder_colour);
  if (filaments.length && filaments.length > extruders.length) out.extruder_colour = filaments;
}

export function mapSettingsToSlic3r(bambuSettings: Settings): Settings {
  const out: Settings = {};
  for (const [bambuKey, slic3rKey] of Object.entries(BAMBU_TO_SLIC3R)) {
    let value = bambuSettings[bambuKey];
    if (value == null || value === "") continue;

    if (bambuKey === "sparse_infill_pattern") value = mapFillPattern(firstValue(value));
    if (BOOLEAN_KEYS.has(bambuKey)) {
      const raw = firstValue(value);
      value = raw === true || raw === "1" || raw === 1 || String(raw).toLowerCase() === "true" ? "1" : "0";
    }
    if (bambuKey === "ironing_type") {
      const raw = String(firstValue(value)).toLowerCase();
      value = raw && raw !== "no ironing" && raw !== "none" ? "1" : "0";
    }
    if (bambuKey === "wall_generator") {
      value = String(firstValue(value)).toLowerCase() === "arachne" ? "arachne" : "classic";
    }
    if (bambuKey === "ensure_vertical_shell_thickness") value = mapVerticalShellThickness(value);
    if (FILAMENT_ARRAY_KEYS.has(bambuKey)) value = asArray(value);
    else if (Array.isArray(value)) value = firstValue(value);

    out[slic3rKey] = value;
  }
  syncExtruderColours(out);
  return out;
}

export function normalizeProjectSettings(config: Settings): Settings {
  const out: Settings = {};
  for (const [key, value] of Object.entries(extractBambuSettings(config))) {
    if (shouldStripSettingKey(key) || isUnsetFilamentSlot(key, value)) continue;
    const cleaned = normalizeSettingValue(value);
    if (cleaned === undefined) continue;
    out[key] = key === "ensure_vertical_shell_thickness" ? mapVerticalShellThickness(cleaned) : cleaned;
  }
  syncExtruderColours(out);
  return out;
}

export function buildSlic3rConfig(mapped: Settings): string {
  const lines = ["; generated by Thingport", ""];
  for (const key of Object.keys(mapped).toSorted()) lines.push(`; ${key} = ${slic3rSerialize(mapped[key])}`);
  return lines.join("\n") + "\n";
}
