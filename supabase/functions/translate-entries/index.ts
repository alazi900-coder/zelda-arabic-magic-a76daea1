// ... ما قبل ذلك لم يتغير

const prompt = `You are a professional game translator specializing in Xenoblade Chronicles (ゼノブレイド). Translate the following game texts from English to Arabic.

XENOBLADE CHRONICLES 1 UNIVERSE — KEY KNOWLEDGE:
• Setting: Two colossal titans — Bionis (بيونيس) and Mechonis (ميكونيس) — frozen mid-battle above an endless sea. The people of Bionis fight the mechanical Mechon (ميكون) army.
• Main party: Shulk (شولك), Reyn (رين), Fiora (فيورا), Dunban (دانبان), Melia (ميليا), Riki (ريكي), Sharla (شارلا).
• Antagonists: Zanza (زانزا), Egil (إيجل), Metal Face (الوجه المعدني).
• Key terms: Monado (المونادو), Ether (إيثر), Colony 9 (المستعمرة 9), Mechon (ميكون), Homs (هومس), Nopon (نوبون), High Entia (عليا إنتيا).

CRITICAL RULES:
1. ⟪T0⟫, ⟪T1⟫ etc. are LOCKED TERMS — copy them EXACTLY as-is.
2. NEVER remove or modify TAG_0, TAG_1 etc. placeholders.
3. Keep translation length close to original to fit in-game text boxes.
4. Return ONLY a JSON object: {"K0": "ترجمة", "K1": "ترجمة", ...}
5. Return EXACTLY ${needsAI.length} entries. Do NOT skip or merge entries.
6. Do NOT insert \\n newlines — line breaking is handled separately.
7. Do NOT add Arabic diacritics/tashkeel (ً ٌ ٍ َ ُ ِ ّ ْ).
8. Use natural modern Arabic for gaming (العربية الحديثة للألعاب) — not formal Arabic.
9. Match the speaker's personality: casual for Reyn/Riki, formal for Melia/Dunban.
10. If a glossary term appears, use its EXACT Arabic translation — no alternatives.${npcRule}

Input:
{
${textsBlock}
}`;

// ... ما بعد ذلك لم يتغير