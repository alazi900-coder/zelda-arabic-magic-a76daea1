/**
 * Appended to the AI prompt whenever a request is for MOTHER 3 (GBA, Shigesato
 * Itoi / Nintendo — the EarthBound/MOTHER series). Like the Risen guard, this
 * counters the model's strong training-data pull toward Xenoblade Chronicles
 * (and now Risen) terminology on generic RPG English text. MOTHER 3 has its own
 * distinct universe and, crucially, its own tone: warm, funny, deceptively
 * simple everyday language with sudden emotional depth — NOT epic high-fantasy
 * (Xenoblade) and NOT gritty medieval/pirate (Risen).
 *
 * Key contamination to rule out: MOTHER 3's psychic powers are "PSI" — never
 * "Ether" (Xenoblade) or generic "Mana"/rune-magic (Risen). Proper nouns
 * (Lucas, Claus, Flint, Hinawa, Kumatora, Duster, Boney, Salsa, Porky, the
 * Magypsies, Mr. Saturn, Tazmily Village, the Nowhere Islands, Drago) belong to
 * MOTHER 3 and must not be "corrected" toward another game's cast or places.
 */
export const MOTHER3_FORGET_OTHER_GAME_RULE =
  'هذه اللعبة هي MOTHER 3 (من سلسلة MOTHER / EarthBound لـ Shigesato Itoi و Nintendo) — ليست Xenoblade Chronicles ولا سلسلة Risen ولا أي جزء منها، ولا علاقة بينها إطلاقاً. ' +
  'انسَ تماماً أي مصطلحات أو أسماء أو آليات لعب من Xenoblade أو Risen (مثل Ether أو Monado من Xenoblade، أو نظام السحر/المانا في Risen) — لا تُطبّقها هنا ولا تستخدمها لتصحيح أو "تصويب" أي مصطلح. ' +
  'قوى MOTHER 3 النفسية اسمها "PSI" (قوى نفسية) وليست Ether ولا Mana. أسماء العلم الخاصة باللعبة (Lucas, Claus, Flint, Hinawa, Kumatora, Duster, Boney, Salsa, Porky, Magypsies, Mr. Saturn, Tazmily, Nowhere Islands, Drago) تخصّ MOTHER 3 — لا تستبدلها بأسماء من ألعاب أخرى. ' +
  'نبرة MOTHER 3 مميّزة: بسيطة يومية دافئة وطريفة وأحياناً مؤثّرة عاطفياً بعمق مفاجئ — حافظ على هذه الروح الطريفة الإنسانية، ولا تُحوّلها إلى أسلوب فانتازيا ملحمي أو أسلوب قروسطي قاتم. ' +
  'التزم حرفياً بما يقوله النص الإنجليزي الأصلي — هو المرجع الوحيد، وليس معرفتك عن أي لعبة أخرى.';

/** Same rule, English wording — for prompts written entirely in English. */
export const MOTHER3_FORGET_OTHER_GAME_RULE_EN =
  'This is MOTHER 3 (the MOTHER/EarthBound series by Shigesato Itoi / Nintendo) — NOT Xenoblade Chronicles and NOT the Risen series, and unrelated to either. ' +
  'Completely disregard any Xenoblade or Risen terminology, names, or mechanics (e.g. Ether or Monado from Xenoblade, or Risen\'s mana/rune-magic) — never apply them here or use them to "correct" a term. ' +
  'MOTHER 3\'s psychic powers are called "PSI", never "Ether" or "Mana". Proper nouns (Lucas, Claus, Flint, Hinawa, Kumatora, Duster, Boney, Salsa, Porky, the Magypsies, Mr. Saturn, Tazmily, the Nowhere Islands, Drago) belong to MOTHER 3 — do not swap them for another game\'s cast or places. ' +
  'MOTHER 3\'s tone is distinctive: simple, warm, funny everyday language with sudden emotional depth — preserve that quirky, human voice; do not turn it into epic high-fantasy or grim medieval prose. ' +
  'Follow literally what the English source text itself says — that is the only authority, not your knowledge of any other game.';
