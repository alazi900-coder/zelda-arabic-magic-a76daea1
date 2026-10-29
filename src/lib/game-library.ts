import type { AiGameProfile } from "./ai-game-profiles";

/** A single registry owns the library, workspace routes and editor source IDs.
 * Existing extraction/build routes remain unchanged. */
export type LibraryCategory = "نينتندو" | "الحاسوب" | "أندرويد" | "بلايستيشن" | "أدوات أخرى";
export interface LibraryGame {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: LibraryCategory;
  platform: string;
  sourceId?: string;
  aiProfile?: AiGameProfile;
  toolPath: string;
  toolLabel: string;
  extraTools?: { label: string; path: string }[];
  colors: readonly [string, string];
}

export const LIBRARY_GAMES: readonly LibraryGame[] = [
  { id: "xenoblade", title: "Xenoblade Chronicles 3", subtitle: "تعريب الملفات والحوارات", description: "استيراد ملفات BDAT وMSBT، تحرير الترجمة وإعادة بناء الملفات.", category: "نينتندو", platform: "Switch", sourceId: "xenoblade", aiProfile: "xenoblade", toolPath: "/xenoblade", toolLabel: "أدوات Xenoblade", extraTools: [{ label: "معالجة الملفات", path: "/process" }, { label: "حزم المود", path: "/mod-packager" }], colors: ["#15364d", "#217d8b"] },
  { id: "goldensun", title: "Golden Sun", subtitle: "الجزء الأول", description: "استخراج حوارات اللعبة وإعادة بنائها مع حماية أكواد التحكم.", category: "نينتندو", platform: "GBA", sourceId: "goldensun", aiProfile: "goldensun", toolPath: "/golden-sun", toolLabel: "أداة Golden Sun", colors: ["#593717", "#b27c30"] },
  { id: "goldensun2", title: "Golden Sun: The Lost Age", subtitle: "الجزء الثاني", description: "مساحة مستقلة عن الجزء الأول، مع الاحتفاظ بنصوص كل روم وترجماته.", category: "نينتندو", platform: "GBA", sourceId: "goldensun2", aiProfile: "goldensun2", toolPath: "/golden-sun", toolLabel: "أداة Golden Sun", colors: ["#4b291c", "#a55f45"] },
  { id: "mother3", title: "MOTHER 3", subtitle: "تحرير روم GBA", description: "التحرير واستخراج النصوص وإعادة البناء بأدوات اللعبة.", category: "نينتندو", platform: "GBA", sourceId: "mother3", aiProfile: "mother3", toolPath: "/mother3", toolLabel: "أداة MOTHER 3", colors: ["#4a2529", "#a44d55"] },
  { id: "metroidprime", title: "Metroid Prime Remastered", subtitle: "النصوص والخطوط والصور", description: "ملفات النص والخطوط والرسومات ضمن أدوات متخصصة.", category: "نينتندو", platform: "Switch", sourceId: "metroidprime", aiProfile: "metroidprime", toolPath: "/metroid-prime", toolLabel: "أدوات Metroid", extraTools: [{ label: "النصوص", path: "/metroid-prime/text" }, { label: "الخطوط", path: "/metroid-prime/font" }, { label: "الصور", path: "/metroid-prime/images" }], colors: ["#143e3a", "#31947e"] },
  { id: "pokemon", title: "Pokémon Ruby Destiny", subtitle: "الجيل الثالث", description: "تحرير النصوص والخط العربي وأدوات الروم.", category: "نينتندو", platform: "GBA", sourceId: "pokemon", aiProfile: "pokemon", toolPath: "/pokemon", toolLabel: "أدوات Pokémon", extraTools: [{ label: "النصوص", path: "/pokemon/text" }, { label: "الخطوط", path: "/pokemon/font" }], colors: ["#423b16", "#ab9139"] },
  { id: "platinum", title: "Pokémon Platinum", subtitle: "ملفات النص", description: "تحرير نصوص نسخة Nintendo DS.", category: "نينتندو", platform: "NDS", sourceId: "platinum", aiProfile: "platinum", toolPath: "/platinum/text", toolLabel: "تحرير النصوص", extraTools: [{ label: "Pokémon Black 2 · JSON", path: "/platinum/black2" }], colors: ["#2b3541", "#76848e"] },
  { id: "pokemon-xp", title: "Pokémon Unbreakable Ties", subtitle: "RPG Maker XP", description: "محرر النصوص مع حماية أوامر Pokémon Essentials.", category: "الحاسوب", platform: "PC", sourceId: "pokemon-xp", aiProfile: "pokemon-xp", toolPath: "/pokemon-unbreakable-ties", toolLabel: "أداة الترجمة", colors: ["#34432b", "#78965d"] },
  { id: "inazuma", title: "Inazuma Eleven", subtitle: "نصوص وصور NDS", description: "تعريب النصوص وتعديل الصور الخاصة باللعبة.", category: "نينتندو", platform: "NDS", sourceId: "inazuma", aiProfile: "inazuma", toolPath: "/inazuma", toolLabel: "أدوات Inazuma", extraTools: [{ label: "الصور", path: "/inazuma/images" }], colors: ["#193c59", "#4c80b2"] },
  { id: "risen1", title: "Risen", subtitle: "الجزء الأول", description: "استخراج ملفات اللغة وتحسين النصوص وخيارات إعادة البناء.", category: "الحاسوب", platform: "PC", sourceId: "risen1", aiProfile: "risen1", toolPath: "/risen", toolLabel: "أداة Risen", extraTools: [{ label: "المعالجة", path: "/risen/process" }, { label: "مدير الملفات", path: "/risen/files" }], colors: ["#46301e", "#947046"] },
  { id: "risen2", title: "Risen 2", subtitle: "ملفات النص والخط", description: "إعدادات تعريب منفصلة عن Risen 1 مع أدوات الخط.", category: "الحاسوب", platform: "PC", sourceId: "risen2", aiProfile: "risen2", toolPath: "/risen", toolLabel: "أداة Risen", extraTools: [{ label: "المعالجة", path: "/risen/process" }, { label: "الخطوط", path: "/risen2/fonts" }], colors: ["#263d3f", "#558786"] },
  { id: "risen3", title: "Risen 3", subtitle: "نصوص وخطوط", description: "أدوات ملفات اللعبة وتعديل الخطوط العربية.", category: "الحاسوب", platform: "PC", sourceId: "risen3", aiProfile: "risen3", toolPath: "/risen", toolLabel: "أداة Risen", extraTools: [{ label: "الخطوط", path: "/risen3/fonts" }], colors: ["#233342", "#57748f"] },
  { id: "gtaiv", title: "Grand Theft Auto IV", subtitle: "ملفات GXT", description: "فحص واستيراد وتحرير النصوص الخاصة باللعبة.", category: "الحاسوب", platform: "PC", sourceId: "gtaiv", aiProfile: "gtaiv", toolPath: "/gta-iv", toolLabel: "أداة GTA IV", colors: ["#3c3731", "#9e8374"] },
  { id: "gtasa", title: "GTA San Andreas", subtitle: "ملفات GXT", description: "ترجمة النصوص مع الحفاظ على رموز المحرك.", category: "أندرويد", platform: "Android / PC", sourceId: "gtasa", aiProfile: "gtasa", toolPath: "/gta-sa", toolLabel: "أداة GTA SA", colors: ["#533025", "#ae6043"] },
  { id: "lumentale", title: "LumenTale", subtitle: "بيانات Unity", description: "تحرير جداول اللعبة وقواعد الترجمة الخاصة بها.", category: "الحاسوب", platform: "PC", sourceId: "lumentale", aiProfile: "lumentale", toolPath: "/lumentale", toolLabel: "أداة LumenTale", colors: ["#2c3758", "#7771a8"] },
  { id: "steinsgate", title: "Steins;Gate", subtitle: "نسخة PSP", description: "استيراد النصوص والتحقق من وسوم المحرك وبناء الملفات.", category: "بلايستيشن", platform: "PSP", sourceId: "steinsgate", aiProfile: "steinsgate", toolPath: "/steins-gate-psp", toolLabel: "أداة Steins;Gate", colors: ["#353b53", "#7b839c"] },
  { id: "crashlands", title: "Crashlands", subtitle: "الملفات النصية", description: "محرر JSON وفلاتر الحوارات والعناصر والمخلوقات.", category: "أندرويد", platform: "Android", sourceId: "crashlands", aiProfile: "crashlands", toolPath: "/crashlands", toolLabel: "أداة Crashlands", colors: ["#4d3519", "#c18433"] },
  { id: "ninthdawn", title: "9th Dawn Remake", subtitle: "تعريب JSON", description: "حوارات ومهام وعناصر وقوائم في محرر مشترك.", category: "أندرويد", platform: "Android / PC", sourceId: "ninthdawn", aiProfile: "ninthdawn", toolPath: "/ninth-dawn-remake", toolLabel: "أداة 9th Dawn", colors: ["#1b384a", "#4d819d"] },
  { id: "franbow", title: "Fran Bow", subtitle: "نصوص وقوائم", description: "تعريب الحوارات والسرد والعناصر والإعدادات.", category: "أندرويد", platform: "Android", sourceId: "franbow", aiProfile: "franbow", toolPath: "/fran-bow", toolLabel: "أداة Fran Bow", colors: ["#39243f", "#9464a4"] },
  { id: "twom", title: "This War of Mine", subtitle: "Stories", description: "حوارات ومذكرات ووسوم محمية داخل محرر النصوص.", category: "أندرويد", platform: "Android", sourceId: "twom", aiProfile: "twom", toolPath: "/twom-stories", toolLabel: "أداة This War of Mine", colors: ["#383631", "#857d72"] },
  { id: "kingdom-hearts", title: "Kingdom Hearts: Birth by Sleep", subtitle: "أدوات PSP", description: "إدارة الملفات والصور والخطوط الخاصة باللعبة.", category: "بلايستيشن", platform: "PSP", sourceId: "kingdom-hearts", toolPath: "/kingdom-hearts-bbs", toolLabel: "أدوات Kingdom Hearts", extraTools: [{ label: "الملفات", path: "/kingdom-hearts-files" }, { label: "الخطوط", path: "/kingdom-hearts-font" }, { label: "الصور", path: "/kingdom-hearts-images" }], colors: ["#353044", "#8179ae"] },
  { id: "dragonsword", title: "DragonSword Awakening", subtitle: "تعريب Nintendo DS", description: "أدوات فحص وفتح ملفات اللعبة.", category: "نينتندو", platform: "NDS", sourceId: "dragonsword", toolPath: "/dragonsword", toolLabel: "أداة DragonSword", colors: ["#412f30", "#a26755"] },
  { id: "fire-emblem-12", title: "Fire Emblem 12", subtitle: "فحص النصوص", description: "فحص ملفات اللعبة ونصوصها.", category: "نينتندو", platform: "NDS", sourceId: "fe12", toolPath: "/fire-emblem-12", toolLabel: "أداة Fire Emblem", colors: ["#43352a", "#9b734c"] },
  { id: "phantom-hourglass", title: "Zelda: Phantom Hourglass", subtitle: "نصوص وشعار", description: "مساحة موحدة لأدوات النص والشعار.", category: "نينتندو", platform: "NDS", sourceId: "ph", toolPath: "/ph-translate", toolLabel: "تعريب الحوارات", extraTools: [{ label: "الشعار", path: "/ph-logo" }], colors: ["#253e35", "#5c9b73"] },
  { id: "majoras-mask", title: "Zelda: Majora's Mask 3D", subtitle: "الشعار", description: "تعديل شعار عنوان اللعبة.", category: "نينتندو", platform: "3DS", toolPath: "/majoras-mask-logo", toolLabel: "أداة الشعار", colors: ["#392641", "#9070a6"] },
];

export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = ["نينتندو", "الحاسوب", "أندرويد", "بلايستيشن", "أدوات أخرى"];
export function findLibraryGame(id: string | undefined): LibraryGame | undefined {
  return LIBRARY_GAMES.find(game => game.id === id);
}
