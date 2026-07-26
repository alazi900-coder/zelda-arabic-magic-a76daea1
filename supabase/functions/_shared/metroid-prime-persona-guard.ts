/**
 * Appended to the AI prompt whenever a request is for Metroid Prime Remastered
 * (Nintendo / Retro Studios — the Metroid series). Same purpose as the Mother 3
 * / Risen guards: counter the model's strong pull toward Xenoblade or other RPG
 * terminology on generic sci-fi English text. Metroid Prime is first-person
 * action-adventure sci-fi, NOT high fantasy or JRPG.
 *
 * Key contamination to rule out: Metroid Prime's protagonist is "Samus Aran"
 * (bounty hunter); enemies are Space Pirates, Metroids, the Chozo, Phazon,
 * Tallon IV. There is no "Monado", "Ether", "PSI", or "mana" here. Text is
 * often terse (HUD, pickups, scan-visor log entries) with a clinical, technical
 * tone; scan entries mimic Federation / Space Pirate / Chozo log prose.
 */
export const METROID_PRIME_FORGET_OTHER_GAME_RULE =
  'هذه اللعبة هي Metroid Prime Remastered (من سلسلة Metroid لـ Nintendo و Retro Studios) — ليست Xenoblade Chronicles ولا سلسلة Risen ولا MOTHER 3 ولا أي جزء منها. ' +
  'انسَ تماماً أي مصطلحات أو أسماء أو آليات من ألعاب أخرى (مثل Monado/Ether من Xenoblade أو PSI من MOTHER أو المانا/السحر في Risen) — لا تُطبّقها هنا. ' +
  'أسماء العلم الخاصة باللعبة (Samus Aran, Chozo, Space Pirates, Metroids, Phazon, Tallon IV, Phendrana, Magmoor, Ridley, Meta Ridley, Galactic Federation, Varia Suit, Morph Ball, Power Suit, Ice Beam, Wave Beam, Plasma Beam, Missile, Grapple Beam, Scan Visor) تخصّ Metroid — لا تستبدلها بأسماء من ألعاب أخرى. ' +
  'نبرة Metroid Prime تقنية وموجزة: الترجمات القصيرة (HUD، عناصر الالتقاط، أسماء الأسلحة/المواقع) يجب أن تبقى قصيرة ودقيقة. نصوص Scan Visor تُكتب بأسلوب سجل استكشافي/عسكري (تقارير علماء Chozo أو Space Pirates أو Galactic Federation). لا تُضف زخرفة أدبية غير موجودة في الأصل. ' +
  'التزم حرفياً بما يقوله النص الإنجليزي الأصلي — هو المرجع الوحيد، وليس معرفتك عن أي لعبة أخرى.';

export const METROID_PRIME_FORGET_OTHER_GAME_RULE_EN =
  'This is Metroid Prime Remastered (the Metroid series by Nintendo / Retro Studios) — NOT Xenoblade Chronicles, NOT the Risen series, NOT MOTHER 3, and unrelated to any of them. ' +
  'Completely disregard any terminology, names, or mechanics from other games (e.g. Monado/Ether from Xenoblade, PSI from MOTHER, or mana/rune-magic from Risen) — never apply them here. ' +
  'Proper nouns (Samus Aran, Chozo, Space Pirates, Metroids, Phazon, Tallon IV, Phendrana, Magmoor, Ridley, Meta Ridley, Galactic Federation, Varia Suit, Morph Ball, Power Suit, Ice Beam, Wave Beam, Plasma Beam, Missile, Grapple Beam, Scan Visor) belong to Metroid — do not swap them for another game\'s cast or places. ' +
  'Metroid Prime\'s tone is terse and technical: short strings (HUD, pickups, weapon/area names) must stay short and precise. Scan Visor text reads like an exploration/military log (Chozo, Space Pirate, or Galactic Federation reports). Do not add literary flourish that isn\'t in the source. ' +
  'Follow literally what the English source text itself says — that is the only authority, not your knowledge of any other game.';
