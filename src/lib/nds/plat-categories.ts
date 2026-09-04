/**
 * Editor category cards for Pokémon Platinum.
 *
 * The archive name is the whole evidence, and it is unusually good evidence:
 * these are the decompilation's own file names — `jubilife_city`,
 * `item_descriptions`, `battle_strings` — not something inferred from the text.
 * So the rules read the name and nothing else; guessing from wording would only
 * add a way to be wrong about a line whose file already says what it is.
 *
 * Order matters below: a name like `battle_tower_records_app` is a facility's
 * menu, not battle prose, so the narrower rule is written first.
 */
import type { ExtractedEntry, FileCategory } from "@/components/editor/types";
import { PLAT_FILE_PREFIX } from "./plat-editor-bridge";

export const PLATINUM_CATEGORIES: FileCategory[] = [
  { id: "plat-dialogue", label: "حوارات المدن والطرق", emoji: "💬", icon: "MessageCircle", color: "text-violet-400" },
  { id: "plat-trainers", label: "المدرّبون ومبارزاتهم", emoji: "🎽", icon: "Users", color: "text-rose-400" },
  { id: "plat-battle", label: "المعارك والحركات", emoji: "⚔️", icon: "Sword", color: "text-red-400" },
  { id: "plat-species", label: "البوكيمون والبوكيدكس", emoji: "🐾", icon: "BookOpen", color: "text-emerald-400" },
  { id: "plat-items", label: "الأدوات والحقيبة والمتاجر", emoji: "🎒", icon: "Backpack", color: "text-amber-400" },
  { id: "plat-menus", label: "القوائم والواجهة", emoji: "▤", icon: "Monitor", color: "text-sky-400" },
  { id: "plat-contest", label: "المسابقات والبوفن", emoji: "🎀", icon: "Sparkles", color: "text-pink-400" },
  { id: "plat-media", label: "التلفاز والبوكيتش", emoji: "📺", icon: "Clapperboard", color: "text-cyan-400" },
  { id: "plat-online", label: "الاتصال والتبادل", emoji: "🌐", icon: "Globe", color: "text-teal-400" },
  { id: "plat-system", label: "النظام والحفظ والأخطاء", emoji: "⚙️", icon: "Settings", color: "text-slate-400" },
  { id: "plat-misc", label: "متفرقات", emoji: "◌", icon: "LibraryBig", color: "text-indigo-400" },
];

export const isPlatEntry = (entry: ExtractedEntry) => entry.msbtFile.startsWith(PLAT_FILE_PREFIX);

/** Places whose archives are map dialogue: towns, routes, caves, landmarks. */
const PLACE = /^(?:route|twinleaf|sandgem|jubilife|oreburgh|floaroma|eterna|hearthome|solaceon|veilstone|pastoria|celestic|canalave|snowpoint|sunyshore|fight_area|survival_area|resort_area|distortion|spear_pillar|mt_|lake_|valley_windworks|victory_road|great_marsh|ravaged_path|fuego|wayward|iron_island|stark_mountain|turnback|trophy_garden|amity_square|pal_park|sendoff|verity|valor|acuity|fullmoon|newmoon|seabreak|flower_paradise|bebe|villa|cafe|restaurant|old_chateau|hall_of_origin|iceberg_ruins|rock_peak_ruins|team_galactic|galactic|trainers_school|mining_museum|cycle_shop|poffin_house|foreign_building|game_corner|vista_lighthouse|grand_lake|footstep_house|day_care|rotoms_room|underground|hidden_items|berry_trees|pokemon_center|pokemon_league|global_terminal|jubilife_tv)/;

export function categorizePlatEntry(entry: ExtractedEntry): string {
  const archive = entry.msbtFile.slice(PLAT_FILE_PREFIX.length);

  if (/^(?:save_|network_errors|system|black_out_scene|migrate_from_gba|end_credits|hall_of_fame|pc_hall_of_fame|diploma|title_screen|seq_names)/.test(archive)) return "plat-system";
  if (/^(?:tv_|poketch|rowan_intro_tv_app|drawing|record_chatot_cry)/.test(archive)) return "plat-media";
  if (/^(?:contest|poffin|ribbon_names|ball_seal|flavor_names|link_contest)/.test(archive)) return "plat-contest";
  if (/^(?:gts|wifi|wfc_|union|global_terminal|country|communication_club|group_connection|spin_trade|trade|plaza_|mystery_gift|easy_chat|greetings|trainer_words|people_words|lifestyle_words|feelings|tough_words|union_words|.*_sentences$)/.test(archive)) return "plat-online";
  if (/^(?:item_|bag|berry_|mail|furniture_names|visible_items|scratch_off|vs_seeker)/.test(archive)) return "plat-items";
  if (/^(?:species|pokedex|pokemon_type_names|ability_|nature_names|status_condition_names|egg_hatch|follower_partners|pokemon_storage_system|box_messages)/.test(archive)) return "plat-species";
  if (/^(?:npc_trainer|frontier_trainer|trainer_class|trainer_card|counterpart|gym_names|npc_trade_names)/.test(archive)) return "plat-trainers";
  if (/^(?:battle|move|field_moves|safari_game)/.test(archive)) return "plat-battle";
  if (/^(?:menu_|main_menu|start_menu|options_menu|party_menu|naming_screen|journal_entries|town_map|location_names|special_met_location_names|month_names|times_of_day|generic_names|common_strings|save_info_window|rankings_machine|bg_events|mailbox|pokemon_summary_screen|trainer_card|party_menu|start_menu)/.test(archive)) return "plat-menus";
  if (PLACE.test(archive)) return "plat-dialogue";
  return "plat-misc";
}
