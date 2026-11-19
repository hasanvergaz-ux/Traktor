// Every game asset (textures, sounds, tractor model) lives in public/game-assets/.
const NAMES = new Set([
  "c_grass.png",
  "c_leaves_a.png",
  "c_leaves_b.png",
  "c_wheat.png",
  "engine_idle.wav",
  "engine_load.wav",
  "o_bark_brown_02_diff.jpg",
  "o_bark_brown_02_nor.jpg",
  "o_clay_roof_tiles_diff.jpg",
  "o_clay_roof_tiles_nor.jpg",
  "o_concrete_floor_02_diff.jpg",
  "o_concrete_floor_02_nor.jpg",
  "o_corrugated_iron_diff.jpg",
  "o_corrugated_iron_nor.jpg",
  "o_painted_plaster_wall_diff.jpg",
  "o_painted_plaster_wall_nor.jpg",
  "o_rough_pine_door_diff.jpg",
  "o_rustic_stone_wall_diff.jpg",
  "o_rustic_stone_wall_nor.jpg",
  "o_rusty_corrugated_iron_diff.jpg",
  "o_rusty_corrugated_iron_nor.jpg",
  "o_thatch_roof_angled_diff.jpg",
  "o_weathered_plank_siding_diff.jpg",
  "o_weathered_plank_siding_nor.jpg",
  "o_wood_planks_diff.jpg",
  "o_wood_planks_nor.jpg",
  "t_asphalt_02_diff.jpg",
  "t_asphalt_02_nor.jpg",
  "t_brown_mud_02_diff.jpg",
  "t_brown_mud_02_nor.jpg",
  "t_brown_mud_dry_diff.jpg",
  "t_brown_mud_dry_nor.jpg",
  "t_farm_soil_diff.jpg",
  "t_farm_soil_nor.jpg",
  "t_grass_ground_diff.jpg",
  "t_grass_ground_nor.jpg",
  "t_sparse_grass_diff.jpg",
  "t_sparse_grass_nor.jpg",
  "t_withered_grass_diff.jpg",
  "t_withered_grass_nor.jpg",
  "tractor.glb",\n  "forklift.glb"
]);

export function asset(name: string): string {
  if (!NAMES.has(name)) throw new Error(`Missing game asset: ${name}`);
  return `/game-assets/${name}`;
}
