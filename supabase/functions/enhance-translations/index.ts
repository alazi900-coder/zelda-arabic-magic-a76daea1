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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { entries, mode, glossary, aiModel } = await req.json() as {
      entries: EnhanceEntry[];
      mode?: 'enhance' | 'grammar' | 'combined';
      glossary?: string;
      aiModel?: string;
    };

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

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
    const isDeepSeek = aiModel === 'deepseek-chat' || aiModel === 'deepseek-reasoner' || aiModel === 'deepseek-v4-pro' || aiModel === 'deepseek-v4-flash';
    const resolvedModel = isDeepSeek
      ? (aiModel as string)
      : ((aiModel && gatewayModelMap[aiModel]) || 'google/gemini-2.5-flash');

    if (isDeepSeek && !DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'DeepSeek غير مُكوّن — أضف DEEPSEEK_API_KEY في أسرار Lovable Cloud' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isDeepSeek && !LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    console.log('[enhance] request', { mode: mode || 'enhance', model: resolvedModel, isDeepSeek, entriesCount: entries?.length || 0 });

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
      const grammarPrompt = `أنت مدقّق ترجمة عربيّة لـ Xenoblade Chronicles 1. صنّف كلّ ترجمة بها مشكلة إلى **فئة واحدة فقط**:

📛 **wrong** — ترجمة خاطئة فعلاً (المعنى مختلف عن الأصل، أو حرف ناقص يكسر الكلمة، أو كلمات ملتصقة، أو لم تُترجم أصلاً)
🔀 **reorder** — الترجمة صحيحة لغوياً وكلماتها سليمة، لكن **ترتيب الكلمات/الجُمل** غير سليم ويجعلها تُقرأ بشكل عكسي أو مربك
✍️ **weak** — الترجمة مفهومة لكنّها **ركيكة** (حرفيّة جداً، أسلوب ضعيف، تحتاج إعادة صياغة لتصبح طبيعيّة)

🚫 **لا تستخدم في اقتراحاتك** (خطّ اللعبة لا يدعم هذه الرموز):
- التنوين (ً ٌ ٍ)
- الحركات (َ ُ ِ)
- الشدّة (ّ) والسكون (ْ)
(ستُنظَّف اقتراحاتك تلقائيّاً من هذه الرموز قبل عرضها — فلا تُضيع وقتك بإضافتها.)

🚫 **لا تُبلّغ أيضاً عن**:
- الأسماء الأعلام لـ Xenoblade Chronicles 1 (${XC1_PROPER_NOUNS}) سواء بقيت إنجليزيّة أو نُقلت صوتياً
- تفضيلات أسلوبيّة بحتة لو الجملة سليمة
- اقتراحات تتعلّق فقط بإضافة/حذف الهمزات (ء آ أ ؤ إ ئ) بدون تغيير قواعديّ حقيقيّ

⚠️ لا تكسر الوسوم التقنيّة [Color:Red] [Icon:*] ولا رموز PUA (\\uE000-\\uE0FF) ولا رموز \\uFFF9-\\uFFFC. لا تَحذف أو تُضِف أيّ رمز من هذه النطاقات.

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

كلّ الحقول إلزاميّة. أعِد فقط الترجمات التي بها مشكلة حقيقيّة.`;

      const response = await callAI([
        { role: 'system', content: 'أنت مدقّق لغويّ عربيّ متخصّص في ترجمة Xenoblade Chronicles 1. أجب بـ JSON صالح فقط. لا تقترح تعديلات أسلوبيّة — فقط أخطاء موضوعيّة.' },
        { role: 'user', content: grammarPrompt },
      ]);

      if (!response.ok) {
        const errText = await response.text();
        console.error('Grammar check error:', response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'تم تجاوز حدّ الطلبات' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'الرصيد غير كافٍ' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || '';
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
      const mappedIssues = (parsed.issues || []).map((i) => ({
        key: entries[i.index ?? -1]?.key || '',
        original: entries[i.index ?? -1]?.original || '',
        translation: entries[i.index ?? -1]?.translation || '',
        category: i.category && ['wrong', 'reorder', 'weak'].includes(i.category) ? i.category : 'wrong',
        issue: i.issue,
        detail: i.detail || '',
        fixExplanation: i.fix_explanation || i.fixExplanation || '',
        // إزالة علامات التشكيل تلقائيّاً (خطّ اللعبة لا يدعمها) — أكثر تساهلاً
        // من رفض الاقتراح بالكامل، يكفي تنظيفه.
        suggestion: stripGameUnsupportedMarks(i.suggestion || ''),
        severity: i.severity || 'medium',
      })).filter((i) => i.key && i.suggestion && i.suggestion !== i.translation);

      return new Response(JSON.stringify({ issues: mappedIssues }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Combined mode — فحص قواعد + تحسين صياغة في طلب واحد. يُرجع اقتراحاً
    // نهائيّاً واحداً لكلّ مدخل يجمع كلّ الإصلاحات معاً (بلا تصادم).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (mode === 'combined') {
      const combinedPrompt = `أنت مدقّق ومحسّن ترجمة عربيّة لـ Xenoblade Chronicles 1. افحص كلّ ترجمة من كلّ الجوانب (قواعد + إملاء + صياغة + دقّة + اتساق + ترتيب الكلمات) وأعِد **نصّاً نهائيّاً واحداً** يجمع كلّ الإصلاحات معاً في حقل suggested (لا تُرجع اقتراحاً للقواعد منفصلاً عن اقتراح للصياغة — كلّ الإصلاحات في نصّ واحد متناسق).

صنّف المشكلة الرئيسيّة إلى **فئة واحدة فقط**:
📛 **wrong** — ترجمة خاطئة فعلاً (المعنى مختلف، حرف ناقص يكسر كلمة، كلمات ملتصقة، لم تُترجم)
🔀 **reorder** — صحيحة لغوياً وكلماتها سليمة لكن ترتيبها يجعلها تُقرأ بشكل عكسي
✍️ **weak** — مفهومة لكنّها ركيكة (حرفيّة جداً، أسلوب ضعيف، تحتاج إعادة صياغة)
🎨 **style** — تحسين صياغة/مصطلح/دقّة (بدون خطأ قواعديّ صريح)

نوع المشكلة الفرعيّ (للفلترة):
- missing_char — حرف ناقص/زائد
- accuracy — ترجمة حرفيّة تحرف المعنى
- style — أسلوب يحتاج إعادة صياغة
- consistency — مصطلح غير متّسق
- terminology — مصطلح من القاموس مترجم خطأ
- grammar — خطأ نحويّ صرف
- punctuation — مشكلة ترقيم

🚫 **لا تستخدم في suggested** (خطّ اللعبة لا يدعم هذه الرموز):
- التنوين (ً ٌ ٍ)
- الحركات (َ ُ ِ)
- الشدّة (ّ) والسكون (ْ)
(ستُنظَّف اقتراحاتك تلقائيّاً من هذه الرموز قبل عرضها.)

🚫 **لا تقترح أيضاً**:
- تغيير الأسماء الأعلام لـ Xenoblade Chronicles 1 (${XC1_PROPER_NOUNS}) سواء بقيت إنجليزيّة أو نُقلت صوتياً
- تعديلات تفضيليّة بحتة لو الجملة مفهومة وسليمة
- تعديلات تتعلّق فقط بإضافة/حذف الهمزات (ء آ أ ؤ إ ئ) بدون تغيير قواعديّ/أسلوبيّ حقيقيّ

⚠️ **قواعد صارمة:**
- لا تكسر الوسوم التقنيّة [Color:Red] [Icon:*] [XENO:n] [XENO:wait] ولا رموز PUA (\\uE000-\\uE0FF) ولا رموز \\uFFF9-\\uFFFC.
- لا تُعِد النصّ نفسه بدون تغيير.
- لا تنتج اقتراحَين متناقضَين لنفس المدخل — اجمع كلّ الإصلاحات (قواعد + صياغة) في نصّ واحد متّسق.

مستوى الخطورة:
- high: خطأ يغيّر المعنى أو يجعل النصّ غير مفهوم (عادةً wrong)
- medium: خطأ واضح يحتاج إصلاح (reorder/weak/style غالباً)
- low: تحسين بسيط

${glossary ? `**القاموس المعتمد (التزم بهذه المصطلحات):**\n${glossary.slice(0, 3000)}` : ''}

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

كلّ الحقول إلزاميّة. أعِد فقط الترجمات التي بها مشكلة حقيقيّة.`;

      const response = await callAI([
        { role: 'system', content: 'أنت مدقّق ومحسّن ترجمة عربيّة محترف لـ Xenoblade Chronicles 1. أجب بـ JSON صالح فقط. اجمع إصلاحات القواعد والصياغة في نصّ واحد لكلّ مدخل — لا تنتج اقتراحَين متعارضَين.' },
        { role: 'user', content: combinedPrompt },
      ]);

      if (!response.ok) {
        const errText = await response.text();
        console.error('Combined check error:', response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'تم تجاوز حدّ الطلبات' }), {
            status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'الرصيد غير كافٍ' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`AI error: ${response.status}`);
      }

      const aiResult = await response.json();
      const content = aiResult.choices?.[0]?.message?.content || '';
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
        .filter((r) => r.key && r.suggested && r.suggested !== r.translation);

      return new Response(JSON.stringify({ results: mappedResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Enhance mode — تحسين صياغة + اقتراح بدائل (مع التزام صارم بالقاموس).
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const enhancePrompt = `أنت مراجع ترجمة عربيّة لـ Xenoblade Chronicles 1. ركّز على الأخطاء الجوهريّة فقط واقترح إصلاحاً.

**أنواع المشاكل المسموح بها فقط:**
1. **missing_char** — حرف ناقص أو زائد ("المعركه"↔"المعركة")
2. **accuracy** — ترجمة حرفيّة تحرف المعنى أو تجعله ركيكاً
3. **style** — جملة بترتيب كلمات سيّئ أو غير مفهومة بحاجة إعادة صياغة
4. **consistency** — نفس المصطلح مترجم بشكلَين مختلفَين بين الجُمل
5. **terminology** — مصطلح من القاموس مترجم بشكل خاطئ

🚫 **لا تستخدم في suggested** (خطّ اللعبة لا يدعم هذه الرموز):
- التنوين (ً ٌ ٍ)
- الحركات (َ ُ ِ)
- الشدّة (ّ) والسكون (ْ)
(ستُنظَّف اقتراحاتك تلقائيّاً من هذه الرموز قبل عرضها.)

🚫 **لا تقترح أيضاً**:
- تغيير الأسماء الأعلام لـ Xenoblade Chronicles 1 (${XC1_PROPER_NOUNS}) إلى الإنجليزيّة أو العكس — اتركها كما هي
- تعديلات تفضيليّة في الأسلوب لو الجملة مفهومة
- تعديلات تتعلّق فقط بإضافة/حذف الهمزات (ء آ أ ؤ إ ئ) بدون تغيير قواعديّ/أسلوبيّ حقيقيّ

⚠️ **قواعد صارمة:**
- لا تكسر الوسوم التقنيّة [Color:Red] [Icon:*] [XENO:n] [XENO:wait] ولا رموز PUA (\\uE000-\\uE0FF) ولا رموز \\uFFF9-\\uFFFC.
- لا تُعِد النصّ نفسه بدون تغيير.

${glossary ? `**القاموس المعتمد (التزم بهذه المصطلحات):**\n${glossary.slice(0, 3000)}` : ''}

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
- ركّز على الأخطاء الموضوعيّة والحروف الناقصة أولاً
- إذا كان النصّ صحيحاً لا تُعِده
- حقل detail إلزاميّ يشرح لماذا هذه مشكلة (سطر أو سطرَين)`;

    const response = await callAI([
      { role: 'system', content: 'أنت مترجم ومراجع محترف لـ Xenoblade Chronicles 1 (نينتندو، مونوليث سوفت). أجب بـ JSON صالح فقط. ركّز على الأخطاء الحقيقيّة لا الأسلوبيّة.' },
      { role: 'user', content: enhancePrompt },
    ]);

    if (!response.ok) {
      const errText = await response.text();
      console.error('Enhance error:', response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'تم تجاوز حدّ الطلبات' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'الرصيد غير كافٍ' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';
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
    const mappedSuggestions = (parsed.suggestions || []).map((s) => ({
      key: entries[s.index ?? -1]?.key || '',
      original: entries[s.index ?? -1]?.original || '',
      current: entries[s.index ?? -1]?.translation || '',
      // إزالة علامات التشكيل تلقائيّاً (خطّ اللعبة لا يدعمها).
      suggested: stripGameUnsupportedMarks(s.suggested || ''),
      alternatives: Array.isArray(s.alternatives)
        ? s.alternatives.filter((a: unknown) => typeof a === 'string' && a.trim())
          .map((a) => stripGameUnsupportedMarks(a as string))
        : [],
      reason: s.reason,
      detail: s.detail || '',
      type: s.type || 'style',
    })).filter((s) => s.key && s.suggested && s.suggested !== s.current);

    return new Response(JSON.stringify({ suggestions: mappedSuggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Enhancement error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'خطأ غير متوقَّع',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
