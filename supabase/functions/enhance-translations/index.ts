// =============================================================================
// enhance-translations — مراجعة ترجمات Xenoblade Chronicles 1 العربيّة عبر Lovable AI Gateway.
// منقولة من Zelda مع تكييف الـ system prompt والـ glossary للأسماء الأعلام
// والمصطلحات الخاصّة بـ Xenoblade Chronicles 1 (Shulk, Reyn, Fiora, Monado، إلخ).
// =============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
  { id: 'block_tashkeel',      kind: 'protect', prompt: '🚫 لا تستخدم في اقتراحاتك: التنوين (ً ٌ ٍ)، الحركات (َ ُ ِ)، الشدّة (ّ)، السكون (ْ). خطّ اللعبة لا يدعم هذه الرموز.' },
  { id: 'protect_proper_nouns', kind: 'protect', prompt: `🚫 لا تقترح تغيير الأسماء الأعلام لـ Xenoblade Chronicles 1 (${'${XC1_PROPER_NOUNS}'}) سواء بقيت إنجليزيّة أو نُقلت صوتياً.` },
  { id: 'skip_preferences',    kind: 'protect', prompt: '🚫 لا تقترح تعديلات تفضيليّة بحتة لو الجملة مفهومة وسليمة.' },
  { id: 'skip_hamza_only',     kind: 'protect', prompt: '🚫 لا تقترح تعديلات تتعلّق فقط بإضافة/حذف الهمزات (ء آ أ ؤ إ ئ) بدون تغيير قواعديّ/أسلوبيّ حقيقيّ.' },
  { id: 'protect_tech_tags',   kind: 'protect', prompt: '⚠️ لا تكسر الوسوم التقنيّة [Color:Red] [Icon:*] [XENO:n] [XENO:wait] ولا رموز PUA (\\uE000-\\uE0FF) ولا رموز \\uFFF9-\\uFFFC.' },
  { id: 'no_identical_output', kind: 'protect', prompt: '⚠️ لا تُعِد النصّ نفسه بدون تغيير. إذا كانت الترجمة صحيحة، تخطَّاها.' },
];
const DEFAULT_RULE_IDS = new Set(RULES.map(r => r.id));
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

function buildRuleSections(
  enabledIds: string[] | undefined,
  customRules: RuleDef[] | undefined,
  builtinOverrides: Record<string, { prompt?: string }> | undefined,
): { detect: string; protect: string; detectCount: number } {
  // طبّق overrides على القواعد المبنيّة قبل الدمج. الـoverride يحلّ محلّ
  // الـprompt المثبّت في هذا الملف إن أرسله العميل لنفس الـid.
  const builtinWithOverrides: RuleDef[] = RULES.map(r => {
    const o = builtinOverrides && builtinOverrides[r.id];
    return (o && typeof o.prompt === 'string' && o.prompt.trim().length > 0)
      ? { ...r, prompt: o.prompt }
      : r;
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
  const detectLines = all.filter(r => r.kind === 'detect' && enabled.has(r.id))
    .map((r, i) => `${i + 1}. ${r.prompt}`);
  const protectLines = all.filter(r => r.kind === 'protect' && enabled.has(r.id)).map(r => r.prompt);
  const detect = detectLines.length > 0
    ? `**أنواع المشاكل المسموح بها:**\n${detectLines.join('\n')}`
    : '(لا توجد قواعد اكتشاف مُفعَّلة — أرجِع قائمة فارغة).';
  const protect = protectLines.length > 0 ? protectLines.join('\n') : '';
  return { detect, protect, detectCount: detectLines.length };
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, mode, glossary, aiModel, providerApiKey, thinkingMode, enabledRules, customRules, builtinOverrides } = await req.json() as {
      entries: EnhanceEntry[];
      mode?: 'enhance' | 'grammar' | 'combined';
      glossary?: string;
      aiModel?: string;
      providerApiKey?: string;
      thinkingMode?: 'enabled' | 'disabled';
      enabledRules?: string[];
      customRules?: RuleDef[];
      builtinOverrides?: Record<string, { prompt?: string }>;
    };

    // قسّم القواعد المُفعَّلة (مبنيّة + مخصّصة) إلى كتلتَي اكتشاف/حماية.
    const ruleSections = buildRuleSections(enabledRules, customRules, builtinOverrides);
    // استبدل علامة ${XC1_PROPER_NOUNS} الحرفيّة في prompt قاعدة الأسماء.
    ruleSections.protect = ruleSections.protect.replace(/\$\{XC1_PROPER_NOUNS\}/g, XC1_PROPER_NOUNS);
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

    // اختيار المسار: DeepSeek مباشر أو Lovable AI Gateway
    // ملاحظة: DeepSeek API لا يقبل سوى اسمَين رسميَّين: deepseek-chat و deepseek-reasoner.
    // أسماء V4 من واجهتنا تُحوَّل إلى الاسمَين الفعليَّين قبل الإرسال وإلّا يفشل الطلب
    // بصمت (200 OK مع error داخلي) وتظهر "تجاوز كلّ النصوص" بلا اقتراحات.
    const DEEPSEEK_NAME_MAP: Record<string, string> = {
      'deepseek-chat': 'deepseek-chat',
      'deepseek-reasoner': 'deepseek-reasoner',
      'deepseek-v4-flash': 'deepseek-chat',
      'deepseek-v4-pro': 'deepseek-reasoner',
    };
    const isDeepSeek = !!aiModel && aiModel in DEEPSEEK_NAME_MAP;
    // إذا أرسلت الواجهة thinkingMode فإنّه يفرض تفعيل/إدراج التفكير العميق على جميع
    // نماذج DeepSeek: enabled → deepseek-reasoner (تفكير)، disabled → deepseek-chat (سريع).
    const resolvedModel = isDeepSeek
      ? (thinkingMode === 'enabled' ? 'deepseek-reasoner'
        : thinkingMode === 'disabled' ? 'deepseek-chat'
        : DEEPSEEK_NAME_MAP[aiModel as string])
      : ((aiModel && gatewayModelMap[aiModel]) || 'google/gemini-2.5-flash');

    if (isDeepSeek && !DEEPSEEK_API_KEY) {
      // 200 مع error field لـ supabase-js حتّى تصل رسالة الخطأ للواجهة.
      return new Response(JSON.stringify({ error: 'DeepSeek غير مُكوّن — أضف DEEPSEEK_API_KEY في أسرار Lovable Cloud' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isDeepSeek && !LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    console.log('[enhance] request', { mode: mode || 'enhance', model: resolvedModel, isDeepSeek, thinkingMode: thinkingMode || 'default', entriesCount: entries?.length || 0 });

    // مساعد لاستدعاء مزوّد الـ AI (Lovable Gateway أو DeepSeek).
    // DeepSeek يحتاج response_format=json_object صراحةً وإلّا يُرجع نصّاً
    // داخل markdown fences لا يلتقطه parser الـ JSON دائماً (نفس تكوين
    // translate-entries الذي يعمل مع جميع نماذج DeepSeek).
    const callAI = async (messages: Array<{ role: string; content: string }>) => {
      if (isDeepSeek) {
        return await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: resolvedModel,
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages,
          }),
        });
      }
      return await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: resolvedModel, messages }),
      });
    };

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], issues: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Grammar check mode — فحص قواعديّ صارم بدون تعديلات أسلوبيّة.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mode === 'grammar') {
      const grammarPrompt = `أنت مدقّق ترجمة عربيّة لـ Xenoblade Chronicles 1. صنّف كلّ ترجمة بها مشكلة إلى **فئة واحدة فقط** (wrong / reorder / weak) بناءً على القواعد المُفعَّلة أدناه:

${ruleSections.detect}

${ruleSections.protect}

(ستُنظَّف اقتراحاتك تلقائيّاً من علامات التشكيل قبل عرضها — فلا تُضيع وقتك بإضافتها.)

مستوى الخطورة:
- high: خطأ يغيّر المعنى أو يجعل النصّ غير مفهوم (عادةً wrong)
- medium: خطأ واضح يحتاج إصلاح (reorder غالباً)
- low: تحسين بسيط (weak خفيف)

النصوص:
${entries.map((e, i) => `[${i}] الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "issues": [
    {
      "index": 0,
      "category": "wrong|reorder|weak",
      "issue": "وصف مختصر جداً للمشكلة (3-7 كلمات)",
      "detail": "اشرح بدقّة: ما المشكلة؟ ولماذا هي مشكلة؟ (سطر أو سطرَين)",
      "fix_explanation": "اشرح الحلّ الذي طبّقته على النصّ ولماذا يحلّ المشكلة (سطر واحد)",
      "suggestion": "النصّ المصحَّح كاملاً",
      "severity": "high|medium|low"
    }
  ]
}

كلّ الحقول إلزاميّة. أعِد فقط الترجمات التي بها مشكلة حقيقيّة.

قاعدة أمان غير قابلة للتجاوز: إذا كان الأصل يحتوي وسوماً تقنية مثل [XENO:n] أو [XENO:wait ...] أو [ML:...] أو رموز PUA، فيجب أن يحتوي حقل suggestion على نفس الوسوم بالعدد والترتيب نفسه. لا تقل إن الوسم غير موجود في الأصل إذا كان ظاهراً في سطر الأصل.`;

      const response = await callAI([
        { role: 'system', content: 'أنت مدقّق لغويّ عربيّ متخصّص في ترجمة Xenoblade Chronicles 1. أجب بـ JSON صالح فقط. لا تقترح تعديلات أسلوبيّة — فقط أخطاء موضوعيّة.' },
        { role: 'user', content: grammarPrompt },
      ]);

      if (!response.ok) {
        const errText = await response.text();
        const provider = isDeepSeek ? 'DeepSeek' : 'Lovable Gateway';
        console.error(`[enhance] grammar ${provider} HTTP ${response.status}:`, errText.slice(0, 500));
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: `تم تجاوز حدّ الطلبات على ${provider} (نموذج ${resolvedModel})` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: `الرصيد غير كافٍ على ${provider}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: `خطأ من ${provider} (HTTP ${response.status}): ${errText.slice(0, 300)}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiResult = await response.json();
      // بعض مزوّدي الـ AI (منهم DeepSeek عندما يكون اسم النموذج غير معروف أو توجد مشكلة في
      // الحساب) يُرجعون 200 OK مع error داخلي بدلاً من 4xx. يجب الكشف عن هذه الحالة حتّى
      // لا تتحول إلى "تقدّم سريع بلا نتائج".
      if (aiResult?.error) {
        const errMsg = typeof aiResult.error === 'string' ? aiResult.error : (aiResult.error.message || JSON.stringify(aiResult.error));
        console.error('[enhance] grammar AI inner error:', errMsg);
        // 200 مع error field — لتفعيل toast في الواجهة (التي تعرض data.error)
        // بدلاً من ابتلاع الخطأ عبر catch block.
        return new Response(JSON.stringify({ error: `خطأ من ${isDeepSeek ? 'DeepSeek' : 'AI Gateway'}: ${errMsg}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!Array.isArray(aiResult?.choices) || aiResult.choices.length === 0) {
        console.error('[enhance] grammar: no choices in AI response', JSON.stringify(aiResult).slice(0, 500));
        return new Response(JSON.stringify({ error: `الـ AI لم يُرجع أيّ جواب — تحقّق من اسم النموذج (${resolvedModel}) أو حالة الخدمة` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const content = aiResult.choices[0]?.message?.content || '';
      type GrammarIssueRaw = { index?: number; category?: string; issue?: string; detail?: string; fix_explanation?: string; fixExplanation?: string; suggestion?: string; severity?: string };
      let parsed: { issues: GrammarIssueRaw[] } = { issues: [] };
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        const raw = (jsonMatch[1] || content).trim();
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
        } else {
          console.error('No JSON object found in AI response:', content.slice(0, 500));
        }
      } catch (e) {
        console.error('JSON parse error:', e, 'Content:', content.slice(0, 500));
      }

      console.log('[enhance] grammar mode parsed', { issuesCount: parsed.issues?.length || 0, model: resolvedModel });
      const mappedIssues = (parsed.issues || []).map((i) => {
        const entry = entries[i.index ?? -1];
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
          suggestion: stripGameUnsupportedMarks(i.suggestion || ''),
          severity: i.severity || 'medium',
        };
      }).filter((i) => i.key && i.suggestion !== i.translation && isSafeSuggestion(i.original, i.translation, i.suggestion));

      return new Response(JSON.stringify({ issues: mappedIssues }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Combined mode — فحص قواعد + تحسين صياغة في طلب واحد. يُرجع اقتراحاً
    // نهائيّاً واحداً لكلّ مدخل يجمع كلّ الإصلاحات معاً (بلا تصادم).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mode === 'combined') {
      const combinedPrompt = `أنت مدقّق ترجمة عربيّة لـ Xenoblade Chronicles 1. افحص فقط القواعد المُفعَّلة أدناه، ولا تُبلّغ عن أي نوع مشكلة غير مذكور في القواعد المُفعَّلة. أعِد **نصّاً نهائيّاً واحداً** يجمع الإصلاحات المسموح بها فقط في حقل suggested.

صنّف الفئة الرئيسيّة (wrong/reorder/weak/style) بناءً على القواعد التالية:

${ruleSections.detect}

ضِف فئة إضافيّة "style" للتحسينات الأسلوبيّة بدون خطأ صريح.

${ruleSections.protect}

(ستُنظَّف اقتراحاتك تلقائيّاً من علامات التشكيل قبل عرضها.)

⚠️ لا تنتج اقتراحَين متناقضَين لنفس المدخل — اجمع كلّ الإصلاحات في نصّ واحد متّسق.

مستوى الخطورة:
- high: خطأ يغيّر المعنى أو يجعل النصّ غير مفهوم (عادةً wrong)
- medium: خطأ واضح يحتاج إصلاح (reorder/weak/style غالباً)
- low: تحسين بسيط

${filteredGlossary ? `**القاموس المعتمد (التزم بهذه المصطلحات):**\n${filteredGlossary}` : ''}

**النصوص للفحص:**
${entries.map((e, i) => `[${i}] الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "results": [
    {
      "index": 0,
      "category": "wrong|reorder|weak|style",
      "type": "missing_char|grammar|terminology|accuracy|style|consistency|punctuation",
      "issue": "وصف مختصر جداً (3-7 كلمات)",
      "detail": "اشرح المشكلة بدقّة (سطر أو سطرَين)",
      "fix_explanation": "اشرح كلّ الإصلاحات المطبَّقة في suggested (قواعد + صياغة معاً) في سطر واحد",
      "suggested": "النصّ النهائيّ المُحسَّن كاملاً (يجمع كلّ الإصلاحات)",
      "alternatives": ["بديل ثانٍ", "بديل ثالث"],
      "severity": "high|medium|low"
    }
  ]
}

كلّ الحقول إلزاميّة. أعِد فقط الترجمات التي بها مشكلة حقيقيّة.

قاعدة أمان غير قابلة للتجاوز: إذا كان الأصل يحتوي وسوماً تقنية مثل [XENO:n] أو [XENO:wait ...] أو [ML:...] أو رموز PUA، فيجب أن يحتوي حقل suggested على نفس الوسوم بالعدد والترتيب نفسه. لا تقل إن الوسم غير موجود في الأصل إذا كان ظاهراً في سطر الأصل.`;

      const response = await callAI([
        { role: 'system', content: 'أنت مدقّق ومحسّن ترجمة عربيّة محترف لـ Xenoblade Chronicles 1. أجب بـ JSON صالح فقط. اجمع إصلاحات القواعد والصياغة في نصّ واحد لكلّ مدخل — لا تنتج اقتراحَين متعارضَين.' },
        { role: 'user', content: combinedPrompt },
      ]);

      if (!response.ok) {
        const errText = await response.text();
        const provider = isDeepSeek ? 'DeepSeek' : 'Lovable Gateway';
        console.error(`[enhance] combined ${provider} HTTP ${response.status}:`, errText.slice(0, 500));
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: `تم تجاوز حدّ الطلبات على ${provider} (نموذج ${resolvedModel})` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: `الرصيد غير كافٍ على ${provider}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: `خطأ من ${provider} (HTTP ${response.status}): ${errText.slice(0, 300)}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiResult = await response.json();
      if (aiResult?.error) {
        const errMsg = typeof aiResult.error === 'string' ? aiResult.error : (aiResult.error.message || JSON.stringify(aiResult.error));
        console.error('[enhance] combined AI inner error:', errMsg);
        return new Response(JSON.stringify({ error: `خطأ من ${isDeepSeek ? 'DeepSeek' : 'AI Gateway'}: ${errMsg}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!Array.isArray(aiResult?.choices) || aiResult.choices.length === 0) {
        console.error('[enhance] combined: no choices in AI response', JSON.stringify(aiResult).slice(0, 500));
        return new Response(JSON.stringify({ error: `الـ AI لم يُرجع أيّ جواب — تحقّق من اسم النموذج (${resolvedModel}) أو حالة الخدمة` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const content = aiResult.choices[0]?.message?.content || '';
      type CombinedResultRaw = {
        index?: number;
        category?: string;
        type?: string;
        issue?: string;
        detail?: string;
        fix_explanation?: string;
        fixExplanation?: string;
        suggested?: string;
        alternatives?: unknown;
        severity?: string;
      };
      let parsed: { results: CombinedResultRaw[] } = { results: [] };
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        const raw = (jsonMatch[1] || content).trim();
        const objMatch = raw.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
        } else {
          console.error('No JSON object found in combined response:', content.slice(0, 500));
        }
      } catch (e) {
        console.error('JSON parse error (combined):', e, 'Content:', content.slice(0, 500));
      }

      console.log('[enhance] combined mode parsed', { resultsCount: parsed.results?.length || 0, model: resolvedModel });
      // تنسيق موحَّد: كلّ نتيجة تحوي الحقول اللازمة لكلا اللوحَتين (issues + suggestions).
      const mappedResults = (parsed.results || []).map((r) => {
        const entry = entries[r.index ?? -1];
        // إزالة علامات التشكيل تلقائيّاً من الاقتراح والبدائل.
        const cleanedSuggested = stripGameUnsupportedMarks(r.suggested || '');
        const cleanedAlternatives = Array.isArray(r.alternatives)
          ? r.alternatives.filter((a: unknown) => typeof a === 'string' && a.trim())
            .map((a) => stripGameUnsupportedMarks(a as string))
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
        .filter((r) => r.key && r.suggested !== r.translation && isSafeSuggestion(r.original, r.translation, r.suggested));

      return new Response(JSON.stringify({ results: mappedResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Enhance mode — تحسين صياغة + اقتراح بدائل (مع التزام صارم بالقاموس).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const enhancePrompt = `أنت مراجع ترجمة عربيّة لـ Xenoblade Chronicles 1. افحص فقط القواعد المُفعَّلة أدناه، ولا تقترح أي تعديل خارجها.

${ruleSections.detect}

${ruleSections.protect}

(ستُنظَّف اقتراحاتك تلقائيّاً من علامات التشكيل قبل عرضها.)

${filteredGlossary ? `**القاموس المعتمد (التزم بهذه المصطلحات):**\n${filteredGlossary}` : ''}

**النصوص للمراجعة:**
${entries.map((e, i) => `[${i}] الأصل: ${e.original}\nالترجمة: ${e.translation}`).join('\n\n')}

أجب بـ JSON فقط:
{
  "suggestions": [
    {
      "index": 0,
      "suggested": "النصّ المحسَّن كاملاً (الخيار الأفضل)",
      "alternatives": ["بديل ثانٍ", "بديل ثالث"],
      "reason": "وصف مختصر للمشكلة (3-7 كلمات)",
      "detail": "شرح أطول يوضّح لماذا هذه مشكلة وأيّ قاعدة خالفتها الترجمة الحالية",
      "type": "missing_char|grammar|terminology|accuracy|style|consistency|punctuation"
    }
  ]
}

**مهم:**
- أعِد فقط الترجمات التي بها مشاكل حقيقيّة
- لا تقترح تعديلات تفضيليّة بحتة
- ركّز فقط على أنواع الأخطاء الموجودة في القواعد المُفعَّلة
- إذا كان النصّ صحيحاً لا تُعِده
- إذا كان الأصل يحتوي وسوماً تقنية مثل [XENO:n] أو [XENO:wait ...] أو [ML:...] أو رموز PUA، فيجب أن يحتوي suggested على نفس الوسوم بالعدد والترتيب نفسه. لا تقل إن الوسم غير موجود في الأصل إذا كان ظاهراً في سطر الأصل.
- حقل detail إلزاميّ يشرح لماذا هذه مشكلة (سطر أو سطرَين)`;

    const response = await callAI([
      { role: 'system', content: 'أنت مترجم ومراجع محترف لـ Xenoblade Chronicles 1 (نينتندو، مونوليث سوفت). أجب بـ JSON صالح فقط. ركّز على الأخطاء الحقيقيّة لا الأسلوبيّة.' },
      { role: 'user', content: enhancePrompt },
    ]);

    if (!response.ok) {
      const errText = await response.text();
      const provider = isDeepSeek ? 'DeepSeek' : 'Lovable Gateway';
      console.error(`[enhance] enhance ${provider} HTTP ${response.status}:`, errText.slice(0, 500));
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: `تم تجاوز حدّ الطلبات على ${provider} (نموذج ${resolvedModel})` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: `الرصيد غير كافٍ على ${provider}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: `خطأ من ${provider} (HTTP ${response.status}): ${errText.slice(0, 300)}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResult = await response.json();
    if (aiResult?.error) {
      const errMsg = typeof aiResult.error === 'string' ? aiResult.error : (aiResult.error.message || JSON.stringify(aiResult.error));
      console.error('[enhance] enhance AI inner error:', errMsg);
      return new Response(JSON.stringify({ error: `خطأ من ${isDeepSeek ? 'DeepSeek' : 'AI Gateway'}: ${errMsg}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Array.isArray(aiResult?.choices) || aiResult.choices.length === 0) {
      console.error('[enhance] enhance: no choices in AI response', JSON.stringify(aiResult).slice(0, 500));
      return new Response(JSON.stringify({ error: `الـ AI لم يُرجع أيّ جواب — تحقّق من اسم النموذج (${resolvedModel}) أو حالة الخدمة` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const content = aiResult.choices[0]?.message?.content || '';
    type EnhanceSuggestionRaw = { index?: number; suggested?: string; alternatives?: unknown; reason?: string; detail?: string; type?: string };
    let parsed: { suggestions: EnhanceSuggestionRaw[] } = { suggestions: [] };
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const raw = (jsonMatch[1] || content).trim();
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) {
        parsed = JSON.parse(objMatch[0]);
      } else {
        console.error('No JSON object found in enhance response:', content.slice(0, 500));
      }
    } catch (e) {
      console.error('JSON parse error (enhance):', e, 'Content:', content.slice(0, 500));
    }

    console.log('[enhance] enhance mode parsed', { suggestionsCount: parsed.suggestions?.length || 0, model: resolvedModel });
    const mappedSuggestions = (parsed.suggestions || []).map((s) => {
      const entry = entries[s.index ?? -1];
      return {
        key: entry?.key || '',
        original: entry?.original || '',
        current: entry?.translation || '',
        // إزالة علامات التشكيل تلقائيّاً (خطّ اللعبة لا يدعمها).
        suggested: stripGameUnsupportedMarks(s.suggested || ''),
        alternatives: Array.isArray(s.alternatives)
          ? s.alternatives.filter((a: unknown) => typeof a === 'string' && a.trim())
            .map((a) => stripGameUnsupportedMarks(a as string))
          : [],
        reason: s.reason,
        detail: s.detail || '',
        type: s.type || 'style',
      };
    }).filter((s) => s.key && s.suggested !== s.current && isSafeSuggestion(s.original, s.current, s.suggested));

    return new Response(JSON.stringify({ suggestions: mappedSuggestions }), {
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
