/**
 * Appended to the AI prompt whenever a request is for Risen 1 — counters the
 * model's strong training-data pull toward Xenoblade Chronicles terminology
 * and game mechanics on generic RPG English text (stat names, item types,
 * magic systems). Confirmed real failures even when the persona text already
 * correctly said "Risen 1": the model "corrected" a Risen "Mana" translation
 * to "Ether" citing Xenoblade lore, and rewrote "Dexterity affects bow damage"
 * to "Dexterity affects hit rate" citing Xenoblade's stat system.
 */
export const RISEN_FORGET_OTHER_GAME_RULE =
  'هذه اللعبة Risen 1 من Piranha Bytes — ليست Xenoblade Chronicles ولا أي جزء من سلسلتها، ولا علاقة بينهما إطلاقاً. ' +
  'انسَ تماماً أي معرفة لديك عن أنظمة إحصائيات أو مصطلحات أو آليات لعب Xenoblade (مثل Ether بدل Mana، أو تأثير Dexterity على دقة الإصابة بدل الأسلحة البعيدة) — لا تُطبّقها هنا تحت أي ظرف ولا تستخدمها لتصحيح أو "تصويب" أي مصطلح أو وصف آلية. ' +
  'التزم حرفياً بما يقوله النص الإنجليزي الأصلي عن أي إحصائية أو آلية لعب أو تأثير — هو المرجع الوحيد، وليس معرفتك عن أي لعبة أخرى.';

/** Same rule, English wording — for prompts written entirely in English. */
export const RISEN_FORGET_OTHER_GAME_RULE_EN =
  'This is Risen 1 (Piranha Bytes) — NOT Xenoblade Chronicles and unrelated to it. ' +
  'Completely disregard any knowledge you have of Xenoblade\'s stat systems, terminology, or game mechanics ' +
  '(e.g. Ether instead of Mana, or Dexterity affecting hit rate instead of ranged weapons) — never apply them here, ' +
  'and never use them to "correct" a term or mechanic description. ' +
  'Follow literally what the English source text itself says about any stat, mechanic, or effect — that is the only ' +
  'authority, not your knowledge of any other game.';
