// =============================================================================
// enhance-translations — مراجعة ترجمات Xenoblade Chronicles 1 العربيّة عبر Lovable AI Gateway.
// منقولة من Zelda مع تكييف الـ system prompt والـ glossary للأسماء الأعلام
// والمصطلحات الخاصّة بـ Xenoblade Chronicles 1 (Shulk, Reyn, Fiora, Monado، إلخ).
// =============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { maskRisenTagPair, unmaskRisenTags } from "../_shared/risen-tag-mask.ts";
import { RISEN_FORGET_OTHER_GAME_RULE } from "../_shared/risen-persona-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EnhanceEntry {
  key: string;
  original: string;
  translation: string;
  fileName?: string;
  tableName?: string;
  /** Risen: resolved category label (e.g. "القوائم والواجهة") — grounds the model instead of it guessing from the raw text alone. */
  category?: string;
}

// خطّ اللعبة لا يدعم علامات التنوين/الحركات/الشدّة/السكون. نُزيلها تلقائيّاً
// من اقتراحات الـ AI قبل إرجاعها لضمان توافقها مع خطّ اللعبة بصرف النظر عن
// تجاهل الـ AI لتعليمات الـ prompt.
function stripGameUnsupportedMarks(text: string): string {
  if (!text) return text;
  return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
}

// قائمة الأسماء الأعلام والمصطلحات الخاصّة بـ Xenoblade Chronicles 1 — لا يجب على الـ AI
// أن يقترح ترجمتها أو تغييرها لأنّ القاموس المعتمد يلتزم بنقل صوتي ثابت.
const XC1_PROPER_NOUNS = [
  // Characters
  'Shulk', 'Reyn', 'Fiora', 'Sharla', 'Dunban', 'Riki', 'Melia',
  'Dickson', 'Mumkhar', 'Alvis', 'Egil', 'Zanza', 'Meyneth',
  // Locations & Factions
  'Bionis', 'Mechonis', 'Mechon', 'Homs', 'Nopon', 'High Entia',
  'Colony 9', 'Colony 6', 'Tephra Cave', 'Mag Mell', 'Frontier Village',
  'Galahad Fortress', 'Prison Island', 'Valak Mountain', 'Eryth Sea',
  // Key items / concepts
  'Monado', 'Ether', 'Aura', 'Arts', 'Talent Art', 'Skill Tree', 'Affinity',
  'Gem', 'Crystal', 'Telethia', 'Faced Mechon',
].join(', ');

// ─── Toggleable rules (mirrors src/lib/enhance-rules.ts) ─────────────────────
// كلّ قاعدة لها id ونصّ prompt يُحقَن عند تفعيلها. الواجهة ترسل enabledRules:string[]
// مع كلّ طلب؛ إذا لم تُرسَل (عملاء قدماء) تُستخدم القائمة الكاملة الافتراضيّة.
interface RuleDef { id: string; kind: 'detect' | 'protect'; prompt: string }
const RULES: RuleDef[] = [
  { id: 'detect_missing_char', kind: 'detect', prompt: '**missing_char** — حرف ناقص أو زائد ("المعركه"↔"المعركة")' },
  { id: 'detect_accuracy',     kind: 'detect', prompt: '**accuracy** — ترجمة حرفيّة تحرف المعنى أو تجعله ركيكاً' },
  { id: 'detect_phrasing',     kind: 'detect', prompt: '**style/weak** — جملة ركيكة أو غير مفهومة تحتاج إعادة صياغة' },
  { id: 'detect_word_order',   kind: 'detect', prompt: '**reorder** — صحيحة لغوياً لكن ترتيب الكلمات/الجُمل غير سليم' },
  { id: 'detect_consistency',  kind: 'detect', prompt: '**consistency** — نفس المصطلح مترجم بشكلَين مختلفَين' },
  { id: 'detect_terminology',  kind: 'detect', prompt: '**terminology** — مصطلح من القاموس مترجم بشكل خاطئ' },
  { id: 'detect_untranslated', kind: 'detect', prompt: '**untranslated** — نصّ بقي إنجليزياً أو كلمات عربيّة ملتصقة بلا فراغات' },
  { id: 'detect_line_breaks', kind: 'detect', prompt: '**line_breaks** — فواصل الأسطر `\\n` و `[XENO:n]`:\n   • قارن **عدد ومواضع** فواصل الأسطر في الترجمة العربيّة بالنصّ الإنجليزي الأصلي:\n       – عدّ مرّات `[XENO:n]` (وسم تقنيّ) — يجب أن تتطابق عدداً وترتيباً مع الأصل\n       – عدّ مرّات `\\n` (حرف سطر جديد U+000A) — يجب أن تتطابق عدداً وترتيباً مع الأصل\n   • إذا فقدت الترجمة فاصلاً موجوداً في الأصل → أضِفه في موقعه الطبيعي (بين جملتَين متّسقتَين بنفس الموضع في الأصل)\n   • إذا أضافت الترجمة فاصلاً غير موجود في الأصل → احذفه\n   • لا تخلط بين `[XENO:n]` و `\\n` — كلٌّ منهما له موضعه ونوعه في الأصل، احتفظ بنفس النوع في نفس الموضع\n   • **مهم تقنيّاً:** `[XENO:n]` نصّ ASCII حرفيّ من 8 أحرف. `\\n` حرف Unicode واحد (U+000A). لا تخلط بينهما.\n   • لا تُغيّر معنى أو كلمات أو ترتيب النصّ — فقط أعِد ضبط فواصل الأسطر فقط لا غير.' },
  { id: 'detect_split_and_tags', kind: 'detect', prompt: '**split_and_tags** — التقسيم والوسوم التقنيّة:\n   • قارن طول الترجمة العربيّة بالنصّ الإنجليزي. إذا كانت أطول بكثير وتتجاوز سطر اللعبة، اختصرها قليلاً **مع الحفاظ على نفس المعنى تماماً** (ممنوع حذف معلومة أو تغيير القصد).\n   • أعِد التقسيم باستخدام `[XENO:n]` (الأساسي) أو `\\n` (نادر) بحيث تطابق مواضع التقسيم في النصّ الإنجليزي قدر الإمكان.\n   • أصلح الوسوم التقنيّة التالفة أو المفقودة: `[XENO:n]`, `[XENO:wait]`, `[Color:Red]`, `[Icon:*]`, `[System:PageBreak]` — استرجعها من الأصل بنفس العدد والترتيب. لا تُضِف وسماً غير موجود ولا تحذف وسماً موجوداً.' },
  // Risen-only rules: prompt text is still declared here but is only injected when
  // the request's game === 'risen' (see RISEN_ONLY_RULE_IDS below) — no effect on Xenoblade.
  { id: 'detect_risen_gendered_pickup', kind: 'detect', prompt: '**accuracy** — [خاص بـ Risen] ضمير مذكّر/مؤنث ثابت (عليها/عليه/فيها/منه...) مرتبط باسم عنصر أو غرض مجهول الجنس في جملة قصيرة مثل إشعارات الحصول على غرض (مثال: "<amount> x <name> obtained!") — الصياغة الصحيحة محايدة الجنس (مثل "تم الحصول على" بدل "تم الحصول عليها/عليه")' },
  { id: 'detect_risen_line_structure', kind: 'detect', prompt: '**line_breaks** — [خاص بـ Risen] بنية الأسطر جزء من التنسيق في المستندات والرسائل الطويلة: قارن عدد ومواضع الأسطر الفارغة (بما فيها الفارغة في البداية) بين الأصل والترجمة — إن دُمجت أو حُذفت أعِد ضبطها لتطابق الأصل تماماً دون تغيير الكلمات' },
  { id: 'block_tashkeel',      kind: 'protect', prompt: '🚫 لا تستخدم في اقتراحاتك: التنوين (ً ٌ ٍ)، الحركات (َ ُ ِ)، الشدّة (ّ)، السكون (ْ). خطّ اللعبة لا يدعم هذه الرموز.' },
  { id: 'protect_proper_nouns', kind: 'protect', prompt: `🚫 لا تقترح تغيير {{PROPER_NOUNS_SECTION}} سواء بقيت إنجليزيّة أو نُقلت صوتياً.` },
  { id: 'protect_no_outside_franchise_lore', kind: 'protect', prompt: '🚫 لا تحكم على مصطلح بأنه خاطئ أو "غريب عن اللعبة" اعتماداً على معرفتك العامة بألعاب أو فرنشايزات أخرى (مثل افتراض أن لعبة معيّنة "تستخدم Ether لا Mana" أو ما شابه). استند فقط إلى القاموس المُعطى فعلياً في هذا الطلب — إن لم يكن المصطلح فيه، فوجوده وحده ليس خطأً يستوجب تغييره.' },
  { id: 'no_invented_content', kind: 'protect', prompt: '🚫 لا تُضِف أي كلمة أو معلومة أو تفصيل غير موجود في النص الإنجليزي الأصلي لمجرد "تجميل" الصياغة أو جعلها تبدو أفضل. الإضافة المسموحة الوحيدة هي كلمات ربط عربية طبيعية يفرضها القواعد دون أي تغيير في المعنى. كل فكرة في اقتراحك يجب أن تقابلها فكرة موجودة فعلاً في الأصل — لا تُقحم تفاصيل من عندك.' },
  { id: 'skip_preferences',    kind: 'protect', prompt: '🚫 لا تقترح تعديلات تفضيليّة بحتة لو الجملة مفهومة وسليمة.' },
  { id: 'skip_hamza_only',     kind: 'protect', prompt: '🚫 لا تقترح تعديلات تتعلّق فقط بإضافة/حذف الهمزات (ء آ أ ؤ إ ئ) بدون تغيير قواعديّ/أسلوبيّ حقيقيّ.' },
  { id: 'protect_tech_tags',   kind: 'protect', prompt: '⚠️ لا تكسر الوسوم التقنيّة [Color:Red] [Icon:*] [XENO:n] [XENO:wait] ولا رموز PUA (\\uE000-\\uE0FF) ولا رموز \\uFFF9-\\uFFFC.' },
  { id: 'no_identical_output', kind: 'protect', prompt: '⚠️ لا تُعِد النصّ نفسه بدون تغيير. إذا كانت الترجمة صحيحة، تخطَّاها.' },
];
const DEFAULT_RULE_IDS = new Set(RULES.map(r => r.id));
/** Rules whose prompt text only makes sense for Risen — excluded from the prompt entirely for Xenoblade, regardless of enabled state. */
const RISEN_ONLY_RULE_IDS = new Set(['detect_risen_gendered_pickup', 'detect_risen_line_structure']);

// ─── Rule-disable enforcement ────────────────────────────────────────────────
// القواعد أعلاه كانت تعتمد فقط على التزام النموذج بتعليمات الـ prompt: تعطيل
// قاعدة كشف واحدة يحذف سطرها من الـ prompt لكن لا شيء يمنع نموذجاً غير مُلتزم
// من إرجاع نتيجة من نفس النوع. الخرائط التالية تُطبَّق على ردّ الـ AI بعد
// التحليل لرفض أي نتيجة نوعها يخصّ قاعدة غير مُفعَّلة فعلياً.
const TYPE_TO_RULE_ID: Record<string, string> = {
  missing_char: 'detect_missing_char',
  accuracy: 'detect_accuracy',
  grammar: 'detect_accuracy',
  punctuation: 'detect_accuracy',
  style: 'detect_phrasing',
  reorder: 'detect_word_order',
  consistency: 'detect_consistency',
  terminology: 'detect_terminology',
  untranslated: 'detect_untranslated',
  line_breaks: 'detect_line_breaks',
  split_and_tags: 'detect_split_and_tags',
};

function isTypeEnabled(type: string | undefined, enabledSet: Set<string>): boolean {
  const ruleId = TYPE_TO_RULE_ID[type || ''];
  if (!ruleId) return true; // نوع غير معروف/مخصّص — لا نحظره احتياطاً.
  return enabledSet.has(ruleId);
}

// وضع "القواعد" (grammar) يُرجع فئة خشنة فقط (wrong/reorder/weak) لا نوعاً دقيقاً،
// لذا الإنفاذ هنا تقريبيّ: نربط كلّ فئة بمجموعة القواعد التي غالباً تنتجها.
const CATEGORY_RULE_FAMILY: Record<string, string[]> = {
  reorder: ['detect_word_order'],
  weak: ['detect_phrasing'],
  wrong: ['detect_missing_char', 'detect_accuracy', 'detect_terminology', 'detect_untranslated', 'detect_risen_gendered_pickup'],
};

function isCategoryEnabled(category: string | undefined, enabledSet: Set<string>): boolean {
  const family = CATEGORY_RULE_FAMILY[category || 'wrong'] || CATEGORY_RULE_FAMILY.wrong;
  return family.some(id => enabledSet.has(id));
}
const TECH_TAG_REGEX = /[\uFFF9-\uFFFC]|[\uE000-\uE0FF]+|\d+\s*\\?\[\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*\w+\s*:[^\]]*?\\?\]\s*\d+|\d+\s*\\?\[[A-Z]{2,10}\\?\]|\\?\[[A-Z]{2,10}\\?\]\s*\d+|\\?\[\s*\/?\s*\w+\s*:[^\]]*?\\?\]|\\?\[\s*[A-Za-z][A-Za-z0-9]*(?:[ '/-]+[A-Za-z0-9]+)*\s*\\?\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}/g;

function extractTechTags(text: string): string[] {
  return [...(text || '').matchAll(new RegExp(TECH_TAG_REGEX.source, TECH_TAG_REGEX.flags))].map(m => m[0]);
}

function hasExactTagSequence(original: string, suggested: string): boolean {
  const orig = extractTechTags(original);
  const next = extractTechTags(suggested);
  if (orig.length !== next.length) return false;
  for (let i = 0; i < orig.length; i++) {
    if (orig[i] !== next[i]) return false;
  }
  return true;
}

function dropsOriginalTechnicalTags(original: string, suggested: string): boolean {
  const origTags = extractTechTags(original);
  if (origTags.length === 0) return extractTechTags(suggested).length > 0;
  return !hasExactTagSequence(original, suggested);
}

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
const LATIN_RE = /[A-Za-z]/g;

function stripTechForLanguageCheck(text: string): string {
  return (text || '').replace(new RegExp(TECH_TAG_REGEX.source, TECH_TAG_REGEX.flags), ' ').replace(/\s+/g, ' ').trim();
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(new RegExp(re.source, re.flags)) || []).length;
}

function isUnsafeEnglishReplacement(original: string, previous: string, suggested: string): boolean {
  const prevPlain = stripTechForLanguageCheck(previous);
  const nextPlain = stripTechForLanguageCheck(suggested);
  const originalPlain = stripTechForLanguageCheck(original).toLowerCase();
  const prevArabic = countMatches(prevPlain, ARABIC_RE);
  if (prevArabic === 0) return false;
  const nextArabic = countMatches(nextPlain, ARABIC_RE);
  const nextLatin = countMatches(nextPlain, LATIN_RE);
  if (nextArabic === 0 && nextLatin > 2) return true;
  if (nextArabic < Math.max(2, Math.floor(prevArabic * 0.35)) && nextLatin > nextArabic) return true;
  if (originalPlain.length >= 8 && nextPlain.toLowerCase().includes(originalPlain)) return true;
  return false;
}

function isSafeSuggestion(original: string, previous: string, suggested: string): boolean {
  return !!suggested && !dropsOriginalTechnicalTags(original, suggested) && !isUnsafeEnglishReplacement(original, previous, suggested);
}

// دفاعيّ (طبقة ثانية بعد تعليمات البرومبت): يرفض أي نتيجة يذكر شرحها أو
// اقتراحها مصطلحاً معروفاً من فرنشايز آخر (Xenoblade/Ether/Monado/Zelda...)
// أثناء العمل على Risen، إلا إذا ظهر ذلك المصطلح فعلاً في النصّ الأصلي أو
// القاموس المُعطى — يمنع تسرّب معرفة النموذج عن لعبة أخرى حتى لو تجاهل
// تعليمات البرومبت (حدث فعلياً: "Mana" ← "Ether" بحجّة Xenoblade).
const OTHER_FRANCHISE_MARKERS_RE = /Xenoblade|Monado|\bEther\b|إيثر|مونادو|\bZelda\b|زيلدا|Hyrule|هايرول|\bShulk\b|\bReyn\b/gi;
function mentionsUnrelatedFranchiseLore(text: string, original: string, glossary?: string): boolean {
  if (!text) return false;
  const markers = text.match(OTHER_FRANCHISE_MARKERS_RE);
  if (!markers || markers.length === 0) return false;
  const haystack = `${original}\n${glossary || ''}`.toLowerCase();
  return markers.some(m => !haystack.includes(m.toLowerCase()));
}

function buildRuleSections(
  enabledIds: string[] | undefined,
  customRules: RuleDef[] | undefined,
  builtinOverrides: Record<string, { prompt?: string }> | undefined,
  isRisen: boolean,
): { detect: string; protect: string; detectCount: number; enabledSet: Set<string> } {
  // طبّق overrides على القواعد المبنيّة قبل الدمج. الـoverride يحلّ محلّ
  // الـprompt المثبّت في هذا الملف إن أرسله العميل لنفس الـid.
  const builtinWithOverrides: RuleDef[] = RULES.map(r => {
    const o = builtinOverrides && builtinOverrides[r.id];
    if (!o || typeof o.prompt !== 'string' || o.prompt.trim().length === 0) return r;
    // دفاعيّ: مستخدمون فتحوا محرّر القواعد قبل إضافة قالب {{PROPER_NOUNS_SECTION}}
    // قد يكون عندهم override محفوظ في localStorage يجمّد نصّاً حرفيّاً قديماً
    // يذكر Xenoblade — يبقى مُرسَلاً للأبد ويتجاوز تسمية اللعبة الصحيحة هنا.
    // تجاهله في جلسات Risen تحديداً؛ الافتراضي الصحيح أدناه يطبَّق بدلاً منه.
    if (r.id === 'protect_proper_nouns' && isRisen && !o.prompt.includes('{{PROPER_NOUNS_SECTION}}') && /Xenoblade/i.test(o.prompt)) {
      return r;
    }
    return { ...r, prompt: o.prompt };
  });
  // اجمع المبنيّة (مع overrides) + المخصّصة معاً قبل الفرز.
  const all: RuleDef[] = [
    ...builtinWithOverrides,
    ...(Array.isArray(customRules) ? customRules.filter(r =>
      r && typeof r.id === 'string' && typeof r.prompt === 'string' &&
      (r.kind === 'detect' || r.kind === 'protect')
    ) : []),
  ];
  // إذا لم تصل enabledRules (عملاء قدماء) فعّل المبنيّة فقط.
  const enabled = (enabledIds && Array.isArray(enabledIds))
    ? new Set(enabledIds)
    : DEFAULT_RULE_IDS;
  // القواعد الخاصّة بـ Risen لا تُحقَن في الـ prompt إطلاقاً عند Xenoblade، حتى لو كانت مُفعَّلة.
  const isActive = (r: RuleDef) => enabled.has(r.id) && (!RISEN_ONLY_RULE_IDS.has(r.id) || isRisen);
  const detectLines = all.filter(r => r.kind === 'detect' && isActive(r))
    .map((r, i) => `${i + 1}. ${r.prompt}`);
  const protectLines = all.filter(r => r.kind === 'protect' && isActive(r)).map(r => r.prompt);
  const detect = detectLines.length > 0
    ? `**أنواع المشاكل المسموح بها:**\n${detectLines.join('\n')}`
    : '(لا توجد قواعد اكتشاف مُفعَّلة — أرجِع قائمة فارغة).';
  const protect = protectLines.length > 0 ? protectLines.join('\n') : '';
  return { detect, protect, detectCount: detectLines.length, enabledSet: enabled };
}

// ─── Smart glossary filter ──────────────────────────────────────────────────
// نأخذ القاموس الكامل ونُرتّبه بحيث المصطلحات الموجودة فعلاً في الدفعة الحالية
// تتصدّر القائمة. هذا يضمن أنّ القطع لا يُضحّي بالمصطلحات ذات الصلة المباشرة.
const GLOSSARY_BUDGET = 3500; // حدّ آمن لـ prompt context.
function smartFilterGlossary(glossary: string | undefined, entries: EnhanceEntry[]): string {
  if (!glossary) return '';
  if (glossary.length <= GLOSSARY_BUDGET) return glossary;
  // اجمع كلّ النصوص الأصليّة لتشكيل مجموعة بحث.
  const haystack = entries.map(e => `${e.original} ${e.translation}`).join(' ').toLowerCase();
  const lines = glossary.split('\n').filter(l => l.trim());
  // ابحث عن المصطلح الإنجليزيّ (أوّل جزء قبل → أو | أو tab أو =).
  const relevant: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    const term = (line.split(/[→|\t=]/)[0] || '').trim().toLowerCase();
    if (term && term.length >= 2 && haystack.includes(term)) {
      relevant.push(line);
    } else {
      rest.push(line);
    }
  }
  // ابدأ بالمصطلحات ذات الصلة ثمّ الباقي حتّى نَملأ الميزانيّة.
  const ordered = [...relevant, ...rest];
  let out = '';
  for (const line of ordered) {
    if (out.length + line.length + 1 > GLOSSARY_BUDGET) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
}

// ─── Multi-pass coverage + Multi-issue merge helper ─────────────────────────
// ينفّذ عدّة مرورات بالتوازي ويدمج النتائج بحسب index.
// التحسين الجديد (Phase 1+2): بدل اختيار "الأغنى" وإسقاط الباقي، ندمج المشاكل
// المختلفة لنفس النص في سجل واحد:
//   • issue/reason: تُجمع بفاصل " • " (بلا تكرار حرفيّ).
//   • detail/fix_explanation: تُجمع بأسطر منفصلة.
//   • alternatives: اتحاد بلا تكرار.
//   • suggested/suggestion: نختار الأطول غير الفارغ (الأكثر اكتمالاً للإصلاحات).
//   • category: نحتفظ بأخطر فئة (wrong > reorder > weak > style).
//   • severity: نحتفظ بالأعلى (high > medium > low).
// هذا يحلّ: "فقدان المشاكل الثانوية" + "Dedup الذي يُسقط بدل أن يدمج".
const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const CATEGORY_RANK: Record<string, number> = { wrong: 4, reorder: 3, weak: 2, style: 1 };

function pickHigherRanked(a: unknown, b: unknown, rank: Record<string, number>): unknown {
  const ra = rank[(a as string) || ''] ?? 0;
  const rb = rank[(b as string) || ''] ?? 0;
  return rb > ra ? b : a;
}

function mergeStringList(existing: string | undefined, incoming: string | undefined, sep: string): string {
  const a = (existing || '').trim();
  const b = (incoming || '').trim();
  if (!a) return b;
  if (!b) return a;
  const parts = a.split(sep).map(s => s.trim()).filter(Boolean);
  if (parts.some(p => p === b)) return a;
  return `${a}${sep}${b}`;
}

function mergeAlternatives(a: unknown, b: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const arr of [a, b]) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const t = item.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function mergeIssueItems<T extends Record<string, unknown>>(existing: T, incoming: T): T {
  const merged: Record<string, unknown> = { ...existing };
  merged.issue = mergeStringList(existing.issue as string, incoming.issue as string, ' • ');
  merged.reason = mergeStringList(existing.reason as string, incoming.reason as string, ' • ');
  merged.detail = mergeStringList(existing.detail as string, incoming.detail as string, '\n');
  merged.fix_explanation = mergeStringList(
    (existing.fix_explanation as string) || (existing.fixExplanation as string),
    (incoming.fix_explanation as string) || (incoming.fixExplanation as string),
    '\n',
  );
  const sa = (existing.suggested as string) || (existing.suggestion as string) || '';
  const sb = (incoming.suggested as string) || (incoming.suggestion as string) || '';
  const finalSug = sb.trim().length > sa.trim().length ? sb : sa;
  if ('suggested' in existing || 'suggested' in incoming) merged.suggested = finalSug;
  if ('suggestion' in existing || 'suggestion' in incoming) merged.suggestion = finalSug;
  if ('alternatives' in existing || 'alternatives' in incoming) {
    merged.alternatives = mergeAlternatives(existing.alternatives, incoming.alternatives);
  }
  merged.category = pickHigherRanked(existing.category, incoming.category, CATEGORY_RANK);
  merged.severity = pickHigherRanked(existing.severity, incoming.severity, SEVERITY_RANK);
  merged.type = (existing.type as string) || (incoming.type as string);
  return merged as T;
}

async function runPasses<T extends { index?: number }>(
  passCount: number,
  callOnce: () => Promise<{ items: T[]; errorResponse?: Response }>,
): Promise<{ merged: T[]; errorResponse?: Response }> {
  const n = Math.min(Math.max(1, passCount || 1), 3);
  const results = await Promise.all(Array.from({ length: n }, () => callOnce()));
  const allFailed = results.every(r => r.errorResponse);
  if (allFailed) return { merged: [], errorResponse: results[0].errorResponse };
  const byIndex = new Map<number, T>();
  for (const r of results) {
    if (r.errorResponse) continue;
    for (const item of r.items) {
      const idx = item.index;
      if (typeof idx !== 'number') continue;
      const existing = byIndex.get(idx);
      if (!existing) { byIndex.set(idx, item); continue; }
      byIndex.set(idx, mergeIssueItems(existing as Record<string, unknown>, item as Record<string, unknown>) as T);
    }
  }
  return { merged: [...byIndex.values()] };
}

// ─── Chunk runner لتسريع وضع تفكير DeepSeek (نفس نمط translate-entries) ────
// وضع التفكير في DeepSeek بطيء جداً على دفعة كبيرة، وأيضاً كثيراً ما يقطع
// الردّ (JSON غير مكتمل) فيُفقد الباتش كاملاً بصمت. الحلّ: نقسّم الدفعة إلى
// قطع صغيرة (chunkSize) تُعالَج كلٌّ منها بشكل مستقل عبر fn (نفس منطق
// البرومبت/الفلترة الحالي لكل وضع) وتُرسَل بالتوازي (concurrency)، ثمّ تُدمَج
// نتائجها النهائيّة بتجميع بسيط — لا حاجة لدمج حسب index لأنّ كل قطعة تُرجع
// عناصر نهائية محلولة القيم بالفعل عبر entriesChunk الخاصّ بها.
async function processInChunks<E, R>(
  entries: E[],
  promptEntries: E[],
  chunkSize: number,
  concurrency: number,
  fn: (entriesChunk: E[], promptEntriesChunk: E[]) => Promise<{ items: R[]; errorResponse?: Response }>,
): Promise<{ items: R[]; errorResponse?: Response; failedEntries: E[] }> {
  if (entries.length <= chunkSize) {
    const result = await fn(entries, promptEntries);
    return { ...result, failedEntries: result.errorResponse ? entries : [] };
  }
  const ranges: { start: number; count: number }[] = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    ranges.push({ start: i, count: Math.min(chunkSize, entries.length - i) });
  }
  const allItems: R[] = [];
  // قطع فشلت (خطأ شبكة/تحليل JSON) — عناصرها لم تُفحَص فعلياً، يجب ألّا
  // تُعامَل الواجهة نصوصها كـ"مفحوصة" وإلّا تُفقد للأبد بصمت.
  const failedEntries: E[] = [];
  let firstError: Response | undefined;
  for (let i = 0; i < ranges.length; i += concurrency) {
    const slice = ranges.slice(i, i + concurrency);
    const results = await Promise.all(slice.map(r =>
      fn(entries.slice(r.start, r.start + r.count), promptEntries.slice(r.start, r.start + r.count)),
    ));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const range = slice[j];
      if (r.errorResponse) {
        if (!firstError) firstError = r.errorResponse;
        failedEntries.push(...entries.slice(range.start, range.start + range.count));
        continue;
      }
      allItems.push(...r.items);
    }
  }
  if (allItems.length === 0 && firstError) return { items: [], errorResponse: firstError, failedEntries };
  return { items: allItems, failedEntries };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, mode, glossary, aiModel, providerApiKey, thinkingMode, enabledRules, customRules, builtinOverrides, passes, game, extraInstructions, learnedFeedback, routingMode, userGeminiKey } = await req.json() as {
      entries: EnhanceEntry[];
      mode?: 'enhance' | 'grammar' | 'combined';
      glossary?: string;
      aiModel?: string;
      providerApiKey?: string;
      thinkingMode?: 'enabled' | 'disabled';
      enabledRules?: string[];
      customRules?: RuleDef[];
      builtinOverrides?: Record<string, { prompt?: string }>;
      passes?: number;
      /** Which game these entries are from — swaps prompt lore/proper-nouns. Defaults to Xenoblade for backward compatibility. */
      game?: 'xenoblade' | 'risen' | 'risen1' | 'risen2';
      /** The active filter card's dedicated prompt, or the general prompt — appended to all 3 modes' prompts. */
      extraInstructions?: string;
      /** أمثلة من رفض/تعديل المستخدم لاقتراحات سابقة (مُنسَّقة جاهزة من src/lib/enhance-feedback-memory.ts) — تُحقن كتنبيه "تجنّب تكرار هذا النمط". */
      learnedFeedback?: string;
      /** free = Gemini direct only (user or server key); paid = Lovable Gateway only; auto = Gemini then fallback to Lovable. */
      routingMode?: 'free' | 'paid' | 'auto';
      /** مفتاح Gemini الشخصي من إعدادات المستخدم — يُستخدم في المسار المباشر (free/auto). */
      userGeminiKey?: string;
    };
    const normalizedRouting: 'free' | 'paid' | 'auto' =
      routingMode === 'free' || routingMode === 'paid' || routingMode === 'auto' ? routingMode : 'paid';

    const isRisen = game === 'risen' || game === 'risen1' || game === 'risen2';
    const gameLabel = isRisen ? 'Risen' : 'Xenoblade Chronicles 1';
    const forgetOtherGame = isRisen ? `\n${RISEN_FORGET_OTHER_GAME_RULE}\n` : '';
    const extraInstructionsBlock = extraInstructions?.trim()
      ? `تعليمات إضافية من المستخدم (أولوية عالية — طبّقها إن لم تتعارض مع القواعد الإلزاميّة أعلاه):\n${extraInstructions.trim().slice(0, 4000)}\n\n`
      : '';
    const learnedFeedbackBlock = learnedFeedback?.trim()
      ? `${learnedFeedback.trim().slice(0, 3000)}\n\n`
      : '';

    // Mask Risen tags (<Exit>, $(name), ...) before ANY prompt text is built —
    // the model never sees them and so can't mistranslate/mangle them. Each
    // entry's original+translation share ONE tag list (maskRisenTagPair), so
    // whichever field the model's response echoes a placeholder from, it can
    // still be unmasked unambiguously. `entries` (raw) stays untouched for
    // index/key/metadata lookups; `promptEntries` (masked) is used ONLY to
    // build prompt text.
    const risenTagsByKey = new Map<string, string[]>();
    const promptEntries: EnhanceEntry[] = isRisen
      ? entries.map((e) => {
          const { maskedA, maskedB, tags } = maskRisenTagPair(e.original, e.translation);
          risenTagsByKey.set(e.key, tags);
          return { ...e, original: maskedA, translation: maskedB };
        })
      : entries;
    const unmaskSuggestion = (key: string, text: string): string => {
      const tags = risenTagsByKey.get(key);
      return tags ? unmaskRisenTags(text, tags) : text;
    };

    // قسّم القواعد المُفعَّلة (مبنيّة + مخصّصة) إلى كتلتَي اكتشاف/حماية.
    const ruleSections = buildRuleSections(enabledRules, customRules, builtinOverrides, isRisen);
    // استبدل {{PROPER_NOUNS_SECTION}} في prompt قاعدة الأسماء — قائمة Xenoblade
    // الفعليّة عند Xenoblade، أو صياغة عامّة (بلا أسماء مُفترَضة) عند Risen.
    const properNounsSection = isRisen
      ? 'أسماء الشخصيات أو الأماكن أو العناصر الخاصّة الواردة في النصّ'
      : `الأسماء الأعلام لـ Xenoblade Chronicles 1 (${XC1_PROPER_NOUNS})`;
    ruleSections.protect = ruleSections.protect.replace(/\{\{PROPER_NOUNS_SECTION\}\}/g, properNounsSection);
    if (ruleSections.detectCount === 0) {
      return new Response(JSON.stringify({ suggestions: [], issues: [], results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // فرز ذكيّ للقاموس: الأولويّة للمصطلحات الموجودة في نصوص الدفعة.
    const filteredGlossary = smartFilterGlossary(glossary, entries || []);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    // مفتاح DeepSeek: الأولوية للمفتاح القادم من الواجهة (إعدادات المستخدم)
    // ثم سرّ Lovable Cloud كاحتياط — مطابق لسلوك translate-entries.
    const DEEPSEEK_API_KEY = (providerApiKey && providerApiKey.trim()) || Deno.env.get('DEEPSEEK_API_KEY');
    const TOKENROUTER_API_KEY = (providerApiKey && providerApiKey.trim()) || Deno.env.get('TOKENROUTER_API_KEY');

    // خريطة موحَّدة لكلّ النماذج المعروضة في TranslationAIEnhancePanel.
    const gatewayModelMap: Record<string, string> = {
      'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
      'gemini-3-pro-preview': 'google/gemini-3-pro-preview',
      'gemini-2.5-flash': 'google/gemini-2.5-flash',
      'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
      'gemini-2.5-pro': 'google/gemini-2.5-pro',
      'gpt-5': 'openai/gpt-5',
      'gpt-5-mini': 'openai/gpt-5-mini',
      'gpt-5-nano': 'openai/gpt-5-nano',
    };
    // موديل الـ fallback عند فشل DeepSeek (ضغط طلبات/رصيد/شبكة) — Gemini سريع
    // ورخيص، مناسب كبديل طارئ بغضّ النظر عن الموديل الأصلي المطلوب.
    const PROVIDER_FALLBACK_MODEL = 'google/gemini-2.5-flash';

    // اختيار المسار: DeepSeek مباشر أو Lovable AI Gateway
    // ملاحظة: منذ V4 (2026-04-24) المعرّفان الحقيقيّان الوحيدان هما
    // deepseek-v4-flash و deepseek-v4-pro؛ deepseek-chat/deepseek-reasoner
    // اسمان قديمان يُحذَفان 2026-07-24 وكانا أصلاً كلاهما يوجّهان إلى
    // deepseek-v4-flash فقط (بلا تفكير / بتفكير) — deepseek-reasoner لم يكن
    // أبداً deepseek-v4-pro. التفكير أصبح معامل طلب منفصل (thinking)، ليس اسم موديل.
    const DEEPSEEK_NAME_MAP: Record<string, string> = {
      'deepseek-v4-flash': 'deepseek-v4-flash',
      'deepseek-v4-pro': 'deepseek-v4-pro',
      // اسمان قديمان احتياطاً لأي عميل لم يُحدَّث بعد.
      'deepseek-chat': 'deepseek-v4-flash',
      'deepseek-reasoner': 'deepseek-v4-pro',
    };
    const isDeepSeek = !!aiModel && aiModel in DEEPSEEK_NAME_MAP;
    const isTokenRouter = aiModel === 'tokenrouter-glm-5.2';
    const resolvedModel = isDeepSeek
      ? DEEPSEEK_NAME_MAP[aiModel as string]
      : isTokenRouter
      ? 'z-ai/glm-5.2-free'
      : ((aiModel && gatewayModelMap[aiModel]) || 'google/gemini-2.5-flash');
    // إذا أرسلت الواجهة thinkingMode فإنّه يفرض تفعيل/تعطيل التفكير العميق صراحةً؛
    // وإلّا الافتراضي حسب الموديل: V4 Pro بتفكير (يطابق سلوك reasoner القديم)،
    // V4 Flash بلا تفكير (يطابق سلوك chat القديم — سريع).
    const deepSeekThinkingEnabled = isDeepSeek
      ? (thinkingMode === 'enabled' ? true : thinkingMode === 'disabled' ? false : resolvedModel === 'deepseek-v4-pro')
      : false;
    // تفعيل التفكير هو سبب البطء الفعليّ (وليس اسم الموديل بحدّ ذاته) —
    // نُقسّم الدفعة فقط عندما يكون التفكير فعليّاً مفعَّلاً (translate-entries
    // يعتمد على اسم الموديل فقط لأنّه لا يملك toggle تفكير منفصلاً؛ هنا
    // deepSeekThinkingEnabled أدقّ لأنّه يعكس القيمة الفعليّة المُرسَلة للـ API).
    const CHUNK = deepSeekThinkingEnabled ? 6 : Infinity;
    const CONCURRENCY = deepSeekThinkingEnabled ? 4 : 1;

    if (isDeepSeek && !DEEPSEEK_API_KEY) {
      // 200 مع error field لـ supabase-js حتّى تصل رسالة الخطأ للواجهة.
      return new Response(JSON.stringify({ error: 'DeepSeek غير مُكوّن — أضف DEEPSEEK_API_KEY في أسرار Lovable Cloud' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (isTokenRouter && !TOKENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: 'يحتاج TokenRouter مفتاح API — أضفه في الإعدادات' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Routing: free/auto → try direct Gemini first (server or user key). ──
    // paid → skip Gemini direct entirely, use Lovable Gateway only.
    const geminiDirectKey = (userGeminiKey && userGeminiKey.trim()) || Deno.env.get('GEMINI_API_KEY') || '';
    const useGeminiDirect = !isDeepSeek && !isTokenRouter && normalizedRouting !== 'paid' && !!geminiDirectKey;
    const allowLovableFallback = normalizedRouting !== 'free';

    if (normalizedRouting === 'free' && !isDeepSeek && !isTokenRouter && !geminiDirectKey) {
      return new Response(JSON.stringify({ error: '🆓 وضع "مجاني فقط": لم يُكوَّن مفتاح Gemini (لا في إعدادات المستخدم ولا في أسرار السيرفر) — أضف مفتاحك من Google AI Studio أو بدّل الوضع' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!useGeminiDirect && !isDeepSeek && !isTokenRouter && !LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    console.log('[enhance] request', { mode: mode || 'enhance', model: resolvedModel, isDeepSeek, isTokenRouter, thinkingMode: thinkingMode || 'default', deepSeekThinkingEnabled, entriesCount: entries?.length || 0, routing: normalizedRouting, useGeminiDirect });

    // يُرفَع لـ true إن اضطُررنا للتحويل من DeepSeek إلى Gemini بسبب فشل مؤقّت —
    // نُضمّنه في الردّ النهائي (_meta.providerFallback) ليعرف المستخدم أنّ
    // النتائج جاءت من موديل غير الذي اختاره، بدل رسالة خطأ عامة.
    let usedProviderFallback = false;

    // ─── Direct Gemini call (Google generative-language API) ─────────────────
    // نُحوّل الرسائل بصيغة OpenAI إلى صيغة Google، ثم نُغلّف الردّ بشكل OpenAI
    // حتى يعمل باقي الكود (choices[0].message.content) بلا تغيير.
    const GEMINI_MODEL_MAP: Record<string, string> = {
      'gemini-3-flash-preview': 'gemini-2.5-flash',
      'gemini-3-pro-preview': 'gemini-2.5-pro',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-2.5-flash-lite': 'gemini-2.5-flash',
      'gemini-2.5-pro': 'gemini-2.5-pro',
    };
    const directGeminiModel = (aiModel && GEMINI_MODEL_MAP[aiModel]) || 'gemini-2.5-flash';
    const callGeminiDirect = async (messages: Array<{ role: string; content: string }>): Promise<Response> => {
      const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const userText = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n\n');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${directGeminiModel}:generateContent?key=${geminiDirectKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
      });
      if (!resp.ok) return resp; // pass through error status
      const data = await resp.json();
      const content = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
      const wrapped = { choices: [{ message: { content } }] };
      return new Response(JSON.stringify(wrapped), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const callLovableGateway = (messages: Array<{ role: string; content: string }>, modelOverride?: string) => fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: modelOverride || resolvedModel, messages }),
    });
    const callGemini = (messages: Array<{ role: string; content: string }>) => callLovableGateway(messages, PROVIDER_FALLBACK_MODEL);

    // يبني حقل _meta الموحَّد للردّ النهائي (تحويل المزوّد + مفاتيح النصوص التي
    // فشل تحليلها فعلياً ولم تُفحَص) — الواجهة تستخدم failedKeys لتجنّب تعليم
    // هذه النصوص كـ"مفحوصة" حتى تُعاد تلقائياً في المحاولة القادمة.
    const buildMetaField = (failedEntries: EnhanceEntry[]): { _meta?: { providerFallback?: string; failedKeys?: string[] } } => {
      const meta: { providerFallback?: string; failedKeys?: string[] } = {};
      if (usedProviderFallback) meta.providerFallback = 'gemini';
      if (failedEntries.length > 0) meta.failedKeys = failedEntries.map(e => e.key);
      return Object.keys(meta).length > 0 ? { _meta: meta } : {};
    };

    // مساعد لاستدعاء مزوّد الـ AI (Lovable Gateway، Gemini المباشر، أو DeepSeek).
    const FALLBACK_STATUSES = new Set([429, 402, 500, 502, 503, 504]);
    const callAI = async (messages: Array<{ role: string; content: string }>): Promise<Response> => {
      if (isDeepSeek) {
        let dsResponse: Response;
        try {
          dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              thinking: { type: deepSeekThinkingEnabled ? 'enabled' : 'disabled' },
              temperature: 0.3,
              response_format: { type: 'json_object' },
              messages,
            }),
          });
        } catch (networkErr) {
          if (!LOVABLE_API_KEY || !allowLovableFallback) throw networkErr;
          console.warn('[enhance] DeepSeek network error — falling back to Gemini:', networkErr);
          usedProviderFallback = true;
          return await callGemini(messages);
        }
        if (!dsResponse.ok && FALLBACK_STATUSES.has(dsResponse.status) && LOVABLE_API_KEY && allowLovableFallback) {
          console.warn(`[enhance] DeepSeek HTTP ${dsResponse.status} — falling back to Gemini`);
          usedProviderFallback = true;
          return await callGemini(messages);
        }
        return dsResponse;
      }

      if (isTokenRouter) {
        let trResponse: Response;
        try {
          trResponse = await fetch('https://api.tokenrouter.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${TOKENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              temperature: 0.3,
              response_format: { type: 'json_object' },
              messages,
            }),
          });
        } catch (networkErr) {
          if (!LOVABLE_API_KEY || !allowLovableFallback) throw networkErr;
          console.warn('[enhance] TokenRouter network error — falling back to Gemini:', networkErr);
          usedProviderFallback = true;
          return await callGemini(messages);
        }
        if (!trResponse.ok && FALLBACK_STATUSES.has(trResponse.status) && LOVABLE_API_KEY && allowLovableFallback) {
          console.warn(`[enhance] TokenRouter HTTP ${trResponse.status} — falling back to Gemini`);
          usedProviderFallback = true;
          return await callGemini(messages);
        }
        return trResponse;
      }

      // Non-DeepSeek/TokenRouter: honor routing mode.
      if (useGeminiDirect) {
        const resp = await callGeminiDirect(messages);
        if (resp.ok) return resp;
        // auto → fallback to Lovable Gateway on quota/server errors.
        if (allowLovableFallback && LOVABLE_API_KEY && FALLBACK_STATUSES.has(resp.status)) {
          console.warn(`[enhance] Gemini direct HTTP ${resp.status} — falling back to Lovable Gateway`);
          usedProviderFallback = true;
          return await callLovableGateway(messages);
        }
        // free mode or non-recoverable error → return the failing response so the shared handler emits a clear error.
        return resp;
      }
      return await callLovableGateway(messages);
    };


    // ─── Single AI call + JSON parse ──────────────────────────────────────
    // يعزل استدعاء الـAI وتحليل JSON في دالّة واحدة تُعيد إمّا قائمة العناصر
    // أو Response جاهز للخطأ. يستخدمها runPasses لتنفيذ مرورات متعدّدة.
    async function callOnceParse<T>(
      messages: Array<{ role: string; content: string }>,
      arrayField: string,
      modeLabel: string,
    ): Promise<{ items: T[]; errorResponse?: Response }> {
      let response: Response;
      try {
        response = await callAI(messages);
      } catch (e) {
        console.error(`[enhance] ${modeLabel} network error:`, e);
        return { items: [], errorResponse: new Response(JSON.stringify({ error: `خطأ شبكة: ${String(e).slice(0, 200)}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
      }
      if (!response.ok) {
        const errText = await response.text();
        const provider = isDeepSeek ? 'DeepSeek' : isTokenRouter ? 'TokenRouter' : 'Lovable Gateway';
        console.error(`[enhance] ${modeLabel} ${provider} HTTP ${response.status}:`, errText.slice(0, 500));
        let errMsg: string;
        if (response.status === 429) errMsg = `تم تجاوز حدّ الطلبات على ${provider} (نموذج ${resolvedModel})`;
        else if (response.status === 402) errMsg = `الرصيد غير كافٍ على ${provider}`;
        else errMsg = `خطأ من ${provider} (HTTP ${response.status}): ${errText.slice(0, 300)}`;
        return { items: [], errorResponse: new Response(JSON.stringify({ error: errMsg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
      }
      const aiResult = await response.json();
      if (aiResult?.error) {
        const errMsg = typeof aiResult.error === 'string' ? aiResult.error : (aiResult.error.message || JSON.stringify(aiResult.error));
        console.error(`[enhance] ${modeLabel} AI inner error:`, errMsg);
        return { items: [], errorResponse: new Response(JSON.stringify({ error: `خطأ من ${isDeepSeek ? 'DeepSeek' : isTokenRouter ? 'TokenRouter' : 'AI Gateway'}: ${errMsg}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
      }
      if (!Array.isArray(aiResult?.choices) || aiResult.choices.length === 0) {
        console.error(`[enhance] ${modeLabel}: no choices in AI response`, JSON.stringify(aiResult).slice(0, 500));
        return { items: [], errorResponse: new Response(JSON.stringify({ error: `الـ AI لم يُرجع أيّ جواب — تحقّق من اسم النموذج (${resolvedModel})` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) };
      }
      const content = aiResult.choices[0]?.message?.content || '';
      // دفاعيّ حاسم: فشل تحليل الرد (رد مبتور/JSON غير صالح) كان سابقاً يُرجَع
      // كـ"لا مشاكل" ناجحة بصمت — يعني الواجهة تُعلّم كل نصوص الدفعة "مفحوصة"
      // رغم أنها لم تُفحص فعلياً، فتُفقد للأبد. الآن أي فشل تحليل حقيقي = خطأ
      // يُرجَع صراحةً، حتى تُعاد هذه النصوص تلقائياً في المحاولة القادمة بدل
      // ضياعها. لا يؤثر على الحالة الطبيعية (رد صالح بمصفوفة فارغة = لا مشاكل).
      let parsed: Record<string, unknown> | null = null;
      let parseFailReason = '';
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        const raw = (jsonMatch[1] || content).trim();
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
        } else {
          parseFailReason = 'لم يُعثر على كائن JSON صالح في الرد (على الأرجح انقطع الرد قبل اكتماله)';
        }
      } catch (e) {
        parseFailReason = `فشل تحليل JSON: ${String(e).slice(0, 150)}`;
      }
      if (parsed === null) {
        console.error(`[enhance] ${modeLabel}: ${parseFailReason}`, content.slice(0, 500));
        return {
          items: [],
          errorResponse: new Response(JSON.stringify({
            error: `تعذّر تحليل ردّ ${isDeepSeek ? 'DeepSeek' : 'AI'} — ${parseFailReason} (سيُعاد فحص هذه النصوص تلقائياً في المحاولة القادمة)`,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
        };
      }
      const arr = parsed[arrayField];
      if (!Array.isArray(arr)) {
        console.error(`[enhance] ${modeLabel}: response JSON missing expected array field "${arrayField}"`, JSON.stringify(parsed).slice(0, 500));
        return {
          items: [],
          errorResponse: new Response(JSON.stringify({
            error: `ردّ ${isDeepSeek ? 'DeepSeek' : 'AI'} لم يحتوِ الحقل المتوقَّع (${arrayField}) — سيُعاد فحص هذه النصوص تلقائياً في المحاولة القادمة`,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }),
        };
      }
      return { items: arr as T[] };
    }


    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], issues: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Grammar check mode — فحص قواعديّ صارم بدون تعديلات أسلوبيّة.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mode === 'grammar') {
      const chunkResult = await processInChunks(entries, promptEntries, CHUNK, CONCURRENCY, async (entriesChunk, promptEntriesChunk) => {
        const grammarPrompt = `أنت مدقّق ترجمة عربيّة لـ ${gameLabel}. صنّف كلّ ترجمة بها مشكلة إلى **فئة واحدة فقط** (wrong / reorder / weak) بناءً على القواعد المُفعَّلة أدناه:
${forgetOtherGame}

${ruleSections.detect}

${ruleSections.protect}

(ستُنظَّف اقتراحاتك تلقائيّاً من علامات التشكيل قبل عرضها — فلا تُضيع وقتك بإضافتها.)

مستوى الخطورة:
- high: خطأ يغيّر المعنى أو يجعل النصّ غير مفهوم (عادةً wrong)
- medium: خطأ واضح يحتاج إصلاح (reorder غالباً)
- low: تحسين بسيط (weak خفيف)

${learnedFeedbackBlock}${extraInstructionsBlock}النصوص:
${promptEntriesChunk.map((e, i) => `[${i}]${e.category ? ` (تصنيف النص: ${e.category})` : ''} الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "issues": [
    {
      "index": 0,
      "category": "wrong|reorder|weak",
      "issue": "وصف مختصر جداً للمشكلة (3-7 كلمات)",
      "detail": "اشرح بدقّة: ما المشكلة؟ ولماذا هي مشكلة؟ (سطر أو سطرَين)",
      "fix_explanation": "اشرح الحلّ الذي طبّقته على النصّ ولماذا يحلّ المشكلة (سطر واحد)",
      "suggestion": "النصّ العربي المصحَّح كاملاً",
      "severity": "high|medium|low"
    }
  ]
}

كلّ الحقول إلزاميّة. أعِد فقط الترجمات التي بها مشكلة حقيقيّة.

قاعدة أمان غير قابلة للتجاوز: إذا كان الأصل يحتوي وسوماً تقنية مثل [XENO:n] أو [XENO:wait ...] أو [ML:...] أو رموز PUA، فيجب أن يحتوي حقل suggestion على نفس الوسوم بالعدد والترتيب نفسه. لا تقل إن الوسم غير موجود في الأصل إذا كان ظاهراً في سطر الأصل.
قاعدة لغة غير قابلة للتجاوز: إذا كانت الترجمة الحالية عربيّة، يجب أن يبقى suggestion عربيّاً. ممنوع نسخ النص الإنجليزي الأصلي أو استبدال الترجمة العربية بالإنجليزية.
كل الشرح في issue/detail/fix_explanation يجب أن يكون بالعربية وبترتيب واضح: المشكلة ثم السبب ثم الحل.

🎯 **تعليمات شاملة الفحص (إلزاميّة):**
1. **افحص كل ترجمة بدقة قبل اعتبارها سليمة** — اقرأ النصّ كاملاً، لا تتخطَّ سطراً.
2. **هدفك إيجاد جميع المشاكل في مرور واحد** — لا تكتفِ بأبرز 3-4 مشاكل وتترك الباقي.
3. **مرّ على كل قاعدة من القواعد المُفعَّلة بالترتيب على كل ترجمة** — لا تركّز على نوع واحد فقط.
4. **Multi-Issue:** يُسمح بإصدار عدّة سجلّات لنفس index كلٌّ بفئة مختلفة (wrong / reorder / weak)، شرط أن يكون suggestion في كلٍّ منها نصّاً عربيّاً نهائيّاً كاملاً يصلح المشكلة المعنيّة. النظام يدمجها تلقائيّاً.
5. سجّل الترجمات السليمة فعلاً فقط بحذفها من الإخراج (لا تُعِدها بدون تغيير).`;

        const passResult = await runPasses<{ index?: number; category?: string; issue?: string; detail?: string; fix_explanation?: string; fixExplanation?: string; suggestion?: string; severity?: string }>(
          passes || 1,
          () => callOnceParse(
            [
              { role: 'system', content: `أنت مدقّق لغويّ عربيّ متخصّص في ترجمة ${gameLabel}. أجب بـ JSON صالح فقط. لا تقترح تعديلات أسلوبيّة — فقط أخطاء موضوعيّة. كن شاملاً — أعِد كل المشاكل الحقيقيّة في مرّة واحدة.` },
              { role: 'user', content: grammarPrompt },
            ],
            'issues',
            'grammar',
          ),
        );
        if (passResult.errorResponse) return { items: [], errorResponse: passResult.errorResponse };

        const mappedIssues = passResult.merged.map((i) => {
          const entry = entriesChunk[i.index ?? -1];
          return {
            key: entry?.key || '',
            original: entry?.original || '',
            translation: entry?.translation || '',
            category: i.category && ['wrong', 'reorder', 'weak'].includes(i.category) ? i.category : 'wrong',
            issue: i.issue,
            detail: i.detail || '',
            fixExplanation: i.fix_explanation || i.fixExplanation || '',
            // إزالة علامات التشكيل تلقائيّاً (خطّ اللعبة لا يدعمها) — أكثر تساهلاً
            // من رفض الاقتراح بالكامل، يكفي تنظيفه.
            suggestion: stripGameUnsupportedMarks(unmaskSuggestion(entry?.key || '', i.suggestion || '')),
            severity: i.severity || 'medium',
          };
        }).filter((i) =>
          i.key && i.suggestion !== i.translation &&
          isSafeSuggestion(i.original, i.translation, i.suggestion) &&
          isCategoryEnabled(i.category, ruleSections.enabledSet) &&
          (!isRisen || !mentionsUnrelatedFranchiseLore(`${i.issue} ${i.detail} ${i.fixExplanation} ${i.suggestion}`, i.original, glossary)),
        );
        return { items: mappedIssues };
      });
      if (chunkResult.errorResponse) return chunkResult.errorResponse;

      console.log('[enhance] grammar mode parsed', { issuesCount: chunkResult.items.length, model: resolvedModel, passes: passes || 1, chunked: entries.length > CHUNK, usedProviderFallback, failedCount: chunkResult.failedEntries.length });

      return new Response(JSON.stringify({ issues: chunkResult.items, ...buildMetaField(chunkResult.failedEntries) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Combined mode — فحص قواعد + تحسين صياغة في طلب واحد. يُرجع اقتراحاً
    // نهائيّاً واحداً لكلّ مدخل يجمع كلّ الإصلاحات معاً (بلا تصادم).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mode === 'combined') {
      const chunkResult = await processInChunks(entries, promptEntries, CHUNK, CONCURRENCY, async (entriesChunk, promptEntriesChunk) => {
        const combinedPrompt = `أنت مدقّق ترجمة عربيّة لـ ${gameLabel}. افحص فقط القواعد المُفعَّلة أدناه، ولا تُبلّغ عن أي نوع مشكلة غير مذكور في القواعد المُفعَّلة. أعِد **نصّاً نهائيّاً واحداً** يجمع الإصلاحات المسموح بها فقط في حقل suggested.
${forgetOtherGame}

صنّف الفئة الرئيسيّة (wrong/reorder/weak/style) بناءً على القواعد التالية:

${ruleSections.detect}

ضِف فئة إضافيّة "style" للتحسينات الأسلوبيّة بدون خطأ صريح.

${ruleSections.protect}

(ستُنظَّف اقتراحاتك تلقائيّاً من علامات التشكيل قبل عرضها.)

⚠️ **يُسمح بإصدار أكثر من مدخل لنفس index** إذا اكتشفت أكثر من نوع مشكلة (مثلاً: ترتيب + ركاكة + مصطلح خاطئ). أعِد سجلّاً منفصلاً لكلّ مشكلة بفئة category مختلفة. النظام سيدمجها تلقائيّاً.
كلّ سجلّ منفصل يجب أن يحتوي suggested نصّاً عربيّاً نهائيّاً كاملاً (وليس جزءاً فقط من الإصلاح).

مستوى الخطورة:
- high: خطأ يغيّر المعنى أو يجعل النصّ غير مفهوم (عادةً wrong)
- medium: خطأ واضح يحتاج إصلاح (reorder/weak/style غالباً)
- low: تحسين بسيط

${filteredGlossary ? `**القاموس المعتمد (التزم بهذه المصطلحات):**\n${filteredGlossary}` : ''}

${learnedFeedbackBlock}${extraInstructionsBlock}**النصوص للفحص:**
${promptEntriesChunk.map((e, i) => `[${i}]${e.category ? ` (تصنيف النص: ${e.category})` : ''} الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "results": [
    {
      "index": 0,
      "category": "wrong|reorder|weak|style",
      "type": "missing_char|grammar|terminology|accuracy|style|consistency|punctuation|line_breaks|split_and_tags|reorder",
      "issue": "وصف مختصر جداً (3-7 كلمات)",
      "detail": "اشرح المشكلة بدقّة (سطر أو سطرَين)",
      "fix_explanation": "اشرح كلّ الإصلاحات المطبَّقة في suggested (قواعد + صياغة معاً) في سطر واحد",
      "suggested": "النصّ العربي النهائيّ المُحسَّن كاملاً (يجمع كلّ الإصلاحات)",
      "alternatives": ["بديل ثانٍ", "بديل ثالث"],
      "severity": "high|medium|low"
    }
  ]
}

كلّ الحقول إلزاميّة. أعِد فقط الترجمات التي بها مشكلة حقيقيّة.

قاعدة أمان غير قابلة للتجاوز: إذا كان الأصل يحتوي وسوماً تقنية مثل [XENO:n] أو [XENO:wait ...] أو [ML:...] أو رموز PUA، فيجب أن يحتوي حقل suggested على نفس الوسوم بالعدد والترتيب نفسه. لا تقل إن الوسم غير موجود في الأصل إذا كان ظاهراً في سطر الأصل.
قاعدة لغة غير قابلة للتجاوز: إذا كانت الترجمة الحالية عربيّة، يجب أن يبقى suggested عربيّاً. ممنوع نسخ النص الإنجليزي الأصلي أو استبدال الترجمة العربية بالإنجليزية.
كل الشرح في issue/detail/fix_explanation يجب أن يكون بالعربية وبترتيب واضح: المشكلة ثم السبب ثم الحل.

🎯 **تعليمات شاملة الفحص (إلزاميّة — اقرأها قبل البدء):**
1. **اقرأ كل ترجمة كاملةً بدقّة** ولا تتخطَّ سطراً. تعامل مع كل ترجمة كمهمّة منفصلة.
2. **هدفك إيجاد جميع المشاكل في فحص واحد** — لا تكتفِ بأبرز 3-5 مشاكل وتترك بقيّة الدفعة. إن وجدت 10-20 مشكلة حقيقيّة فأعِدها كلّها.
3. **مرّ على كل قاعدة من القواعد المُفعَّلة (1، 2، 3 …) على كل ترجمة بالترتيب** قبل أن تنتقل إلى الترجمة التالية.
4. **Multi-Issue:** يُسمح بإصدار عدّة مدخلات لنفس index كلٌّ بفئة مختلفة (wrong + reorder + weak). كلّ سجلّ يجب أن يحوي suggested نهائيّاً كاملاً يصلح المشكلة المعنيّة على الأقلّ. النظام يدمج تلقائيّاً.
5. اختر فئة واحدة لكلّ سجلّ، الأخطر إن كانت المشكلة الواحدة قابلة للتصنيف بأكثر من فئة (wrong > reorder > weak > style).
6. الترجمات السليمة فعلاً: لا تُدرجها في النتائج.`;

        const passResult = await runPasses<{ index?: number; category?: string; type?: string; issue?: string; detail?: string; fix_explanation?: string; fixExplanation?: string; suggested?: string; alternatives?: unknown; severity?: string }>(
          passes || 1,
          () => callOnceParse(
            [
              { role: 'system', content: `أنت مدقّق ومحسّن ترجمة عربيّة محترف لـ ${gameLabel}. أجب بـ JSON صالح فقط. اجمع إصلاحات القواعد والصياغة في نصّ واحد لكلّ مدخل. كن شاملاً — أعِد كل المشاكل دفعةً واحدةً.` },
              { role: 'user', content: combinedPrompt },
            ],
            'results',
            'combined',
          ),
        );
        if (passResult.errorResponse) return { items: [], errorResponse: passResult.errorResponse };

        // تنسيق موحَّد: كلّ نتيجة تحوي الحقول اللازمة لكلا اللوحَتين (issues + suggestions).
        const mappedResults = passResult.merged.map((r) => {
          const entry = entriesChunk[r.index ?? -1];
          // إزالة علامات التشكيل تلقائيّاً من الاقتراح والبدائل.
          const cleanedSuggested = stripGameUnsupportedMarks(unmaskSuggestion(entry?.key || '', r.suggested || ''));
          const cleanedAlternatives = Array.isArray(r.alternatives)
            ? r.alternatives.filter((a: unknown) => typeof a === 'string' && a.trim())
              .map((a) => stripGameUnsupportedMarks(unmaskSuggestion(entry?.key || '', a as string)))
            : [];
          return {
            key: entry?.key || '',
            original: entry?.original || '',
            translation: entry?.translation || '',
            current: entry?.translation || '',
            suggested: cleanedSuggested,
            suggestion: cleanedSuggested,
            alternatives: cleanedAlternatives,
            category: r.category && ['wrong', 'reorder', 'weak', 'style'].includes(r.category) ? r.category : 'style',
            type: r.type || 'style',
            issue: r.issue || '',
            reason: r.issue || '',
            detail: r.detail || '',
            fixExplanation: r.fix_explanation || r.fixExplanation || '',
            severity: r.severity || 'medium',
          };
        })
          .filter((r) =>
            r.key && r.suggested !== r.translation &&
            isSafeSuggestion(r.original, r.translation, r.suggested) &&
            isTypeEnabled(r.type, ruleSections.enabledSet) &&
            (!isRisen || !mentionsUnrelatedFranchiseLore(`${r.issue} ${r.detail} ${r.fixExplanation} ${r.suggested}`, r.original, glossary)),
          );
        return { items: mappedResults };
      });
      if (chunkResult.errorResponse) return chunkResult.errorResponse;

      console.log('[enhance] combined mode parsed', { resultsCount: chunkResult.items.length, model: resolvedModel, passes: passes || 1, chunked: entries.length > CHUNK, usedProviderFallback, failedCount: chunkResult.failedEntries.length });

      return new Response(JSON.stringify({ results: chunkResult.items, ...buildMetaField(chunkResult.failedEntries) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Enhance mode — تحسين صياغة + اقتراح بدائل (مع التزام صارم بالقاموس).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const chunkResult = await processInChunks(entries, promptEntries, CHUNK, CONCURRENCY, async (entriesChunk, promptEntriesChunk) => {
      const enhancePrompt = `أنت مراجع ترجمة عربيّة لـ ${gameLabel}. افحص فقط القواعد المُفعَّلة أدناه، ولا تقترح أي تعديل خارجها.
${forgetOtherGame}

${ruleSections.detect}

${ruleSections.protect}

(ستُنظَّف اقتراحاتك تلقائيّاً من علامات التشكيل قبل عرضها.)

${filteredGlossary ? `**القاموس المعتمد (التزم بهذه المصطلحات):**\n${filteredGlossary}` : ''}

${learnedFeedbackBlock}${extraInstructionsBlock}**النصوص للمراجعة:**
${promptEntriesChunk.map((e, i) => `[${i}]${e.category ? ` (تصنيف النص: ${e.category})` : ''} الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "suggestions": [
    {
      "index": 0,
      "suggested": "النصّ المحسَّن كاملاً (الخيار الأفضل)",
      "alternatives": ["بديل ثانٍ", "بديل ثالث"],
      "reason": "وصف مختصر للمشكلة (3-7 كلمات)",
      "detail": "شرح أطول يوضّح لماذا هذه مشكلة وأيّ قاعدة خالفتها الترجمة الحالية",
      "type": "missing_char|grammar|terminology|accuracy|style|consistency|punctuation|line_breaks|split_and_tags|reorder"
    }
  ]
}

**مهم:**
- أعِد فقط الترجمات التي بها مشاكل حقيقيّة
- لا تقترح تعديلات تفضيليّة بحتة
- ركّز فقط على أنواع الأخطاء الموجودة في القواعد المُفعَّلة
- إذا كان النصّ صحيحاً لا تُعِده
- إذا كان الأصل يحتوي وسوماً تقنية مثل [XENO:n] أو [XENO:wait ...] أو [ML:...] أو رموز PUA، فيجب أن يحتوي suggested على نفس الوسوم بالعدد والترتيب نفسه. لا تقل إن الوسم غير موجود في الأصل إذا كان ظاهراً في سطر الأصل.
- إذا كانت الترجمة الحالية عربيّة، يجب أن يبقى suggested عربيّاً. ممنوع نسخ النص الإنجليزي الأصلي أو استبدال الترجمة العربية بالإنجليزية.
- حقلا reason وdetail إلزاميّان وبالعربية: السبب أولاً ثم الحل المقترح باختصار.

🎯 **تعليمات شاملة الفحص (إلزاميّة):**
1. **اقرأ كل ترجمة كاملةً** وطبّق *جميع* القواعد المُفعَّلة عليها قبل الانتقال للتالية.
2. **هدفك إيجاد جميع المشاكل في مرور واحد** — لا تكتفِ بأبرز 3-5 اقتراحات.
3. **Multi-Issue:** يُسمح بإصدار عدّة سجلّات لنفس index لمشاكل من فئات/أنواع مختلفة، شرط أن يكون suggested في كلٍّ منها نصّاً عربيّاً نهائيّاً كاملاً. النظام يدمجها تلقائيّاً.`;

      const passResult = await runPasses<{ index?: number; suggested?: string; alternatives?: unknown; reason?: string; detail?: string; type?: string }>(
        passes || 1,
        () => callOnceParse(
          [
            { role: 'system', content: isRisen
              ? `أنت مترجم ومراجع محترف لـ ${gameLabel}. أجب بـ JSON صالح فقط. كن شاملاً — أعِد كل المشاكل الحقيقيّة دفعةً واحدةً.`
              : `أنت مترجم ومراجع محترف لـ ${gameLabel} (نينتندو، مونوليث سوفت). أجب بـ JSON صالح فقط. كن شاملاً — أعِد كل المشاكل الحقيقيّة دفعةً واحدةً.` },
            { role: 'user', content: enhancePrompt },
          ],
          'suggestions',
          'enhance',
        ),
      );
      if (passResult.errorResponse) return { items: [], errorResponse: passResult.errorResponse };

      const mappedSuggestions = passResult.merged.map((s) => {
        const entry = entriesChunk[s.index ?? -1];
        return {
          key: entry?.key || '',
          original: entry?.original || '',
          current: entry?.translation || '',
          // إزالة علامات التشكيل تلقائيّاً (خطّ اللعبة لا يدعمها).
          suggested: stripGameUnsupportedMarks(unmaskSuggestion(entry?.key || '', s.suggested || '')),
          alternatives: Array.isArray(s.alternatives)
            ? s.alternatives.filter((a: unknown) => typeof a === 'string' && a.trim())
              .map((a) => stripGameUnsupportedMarks(unmaskSuggestion(entry?.key || '', a as string)))
            : [],
          reason: s.reason,
          detail: s.detail || '',
          type: s.type || 'style',
        };
      }).filter((s) =>
        s.key && s.suggested !== s.current &&
        isSafeSuggestion(s.original, s.current, s.suggested) &&
        isTypeEnabled(s.type, ruleSections.enabledSet) &&
        (!isRisen || !mentionsUnrelatedFranchiseLore(`${s.reason} ${s.detail} ${s.suggested}`, s.original, glossary)),
      );
      return { items: mappedSuggestions };
    });
    if (chunkResult.errorResponse) return chunkResult.errorResponse;

    console.log('[enhance] enhance mode parsed', { suggestionsCount: chunkResult.items.length, model: resolvedModel, passes: passes || 1, chunked: entries.length > CHUNK, usedProviderFallback, failedCount: chunkResult.failedEntries.length });

    return new Response(JSON.stringify({ suggestions: chunkResult.items, ...buildMetaField(chunkResult.failedEntries) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Enhancement error:', error);
    // 200 مع error field حتّى تصل رسالة الخطأ للواجهة عبر supabase.functions.invoke
    // (الذي يبتلع جسم الردّ عند استجابات non-2xx).
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'خطأ غير متوقَّع',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
