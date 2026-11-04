/**
 * Bank names for the English-only Black 2 JSON (metadata + entries/id/english).
 * Mapped by archive + bank ID against the original 52,636-entry / 918-bank
 * export, Pokemon-Black-2-English-Translatable-Texts.json.
 * The four absent bank names are labeled from their own English text:
 * 32 options, 54 Juniper intro, 363 gender choices, 440 learning moves.
 * This is editor-only metadata: exported id/english/metadata remain unchanged.
 */
const SYSTEM_BANKS: Readonly<Record<number, string>> = {
  0: 'questionnaire_answers', 1: 'b_bag_main', 2: 'egg_demo', 6: 'btl_main',
  7: 'entree_forest', 8: 'br_res', 13: 'btl_pokeparam_box_main_save_init',
  21: 'btlv_input', 24: 'cg_help', 32: 'options_menu', 34: 'btl_main_2',
  40: 'fmission_view_setup', 44: 'gsync_menu', 54: 'intro_professor_juniper',
  62: 'startmenu_2', 64: 'item_names', 69: 'event_phrase_input', 81: 'title_12',
  82: 'medal_info_viewer', 83: 'medal_names', 84: 'medal_ranks',
  90: 'species_names', 93: 'title_13', 98: 'musical_event', 109: 'place_names',
  110: '0110', 119: 'pms_words_initial_g', 126: 'pms_words_initial_n',
  128: 'pms_words_initial_p', 132: 'pms_words_initial_t',
  167: 'pms_words_term', 168: 'pms_words_connection',
  177: 'ability_handlers_3', 179: 'p_sta_sys',
  180: 'event_pass_power_startmenu', 313: 'pkwd_briefing_common',
  354: 'pokewood_lines', 363: 'gender_choice_ui', 369: 'title_15',
  372: 'stat_names', 384: 'local_tvt_talk', 399: 'union_msg',
  401: 'evolution_demo_btl_main', 413: 'wifi_bsubway', 415: 'worldtrade',
  416: 'wifi_p2pmatch', 418: 'wifi_note', 439: 'wifi_error',
  440: 'move_learning_prompts', 479: 'pokedex_search_main',
  482: 'item_names_plural',
};

const SCRIPT_BANKS: Readonly<Record<number, string>> = {
  61: 'royal_unova', 66: 'medal_office', 87: 'musical_theater',
  88: 'musical_theater_2', 169: 'aspertia_city',
  173: 'aspertia_city_2', 198: 'pokestar_studios',
  199: 'pokestar_studios_2', 200: 'pokestar_studios_3',
  201: 'pokestar_studios_4', 202: 'pokestar_studios_5',
  203: 'join_avenue', 204: 'join_avenue_2',
  310: 'abyssal_ruins_5', 311: 'abyssal_ruins_6',
  312: 'abyssal_ruins_7', 313: 'abyssal_ruins_8',
  415: 'skyarrow_bridge', 461: 'musical_theater_3',
  511: 'global_2260', 544: 'route_6_2', 609: 'global_10685',
  610: 'scrcmd_resort_shop', 613: 'scrcmd_shop',
  675: 'global_10105',
};

/** Unknown banks return null. Never classify based on translated prose. */
export function black2CompactBankName(archive: string, bankId: number): string | null {
  if (!Number.isSafeInteger(bankId) || bankId < 0) return null;
  if (archive === 'a/0/0/2') {
    // Pokéstar movie books 00-40; movie 33 onward reverses boy/girl bank order.
    if (bankId >= 181 && bankId <= 262) {
      const film = Math.floor((bankId - 181) / 2);
      const isGirl = bankId < 247 ? bankId % 2 === 1 : bankId % 2 === 0;
      return `pkwd_book_movie_${String(film).padStart(2, '0')}_${isGirl ? 'girl' : 'boy'}`;
    }
    if (bankId >= 267 && bankId <= 307) {
      return `pkwd_briefing_movie_${String(bankId - 267).padStart(2, '0')}`;
    }
    return SYSTEM_BANKS[bankId] ?? null;
  }
  if (archive === 'a/0/0/3') return SCRIPT_BANKS[bankId] ?? null;
  return null;
}

/** Works with the editor's internal ID path, including saved old sessions. */
export function black2CompactBankNameFromEditorPath(msbtFile: string): string | null {
  const match = /^black2\/(a\/\d+\/\d+\/\d+)\/bank_(\d+)\/section_\d+$/.exec(msbtFile);
  return match ? black2CompactBankName(match[1], Number(match[2])) : null;
}
