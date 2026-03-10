import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReviewEntry {
  key: string;
  original: string;
  translation: string;
  maxBytes: number;
}

interface ReviewIssue {
  key: string;
  type: 'missing_tag' | 'too_long' | 'inconsistent' | 'untranslated_term' | 'placeholder_mismatch' | 'remaining_english';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

function extractTags(text: string): string[] {
  const tags = text.match(/\[[^\]]*\]/g) || [];
  return tags;
}

function extractPlaceholders(text: string): string[] {
  const placeholders = text.match(/\uFFFC/g) || [];
  return placeholders;
}

function getUtf16ByteLength(text: string): number {
  // MSBT uses UTF-16LE encoding
  return text.length * 2;
}

Deno.serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }

   try {
      const { entries, glossary, action, aiModel, contextEntries } = await req.json() as {
        entries: ReviewEntry[];
        glossary?: string;
        action?: 'review' | 'suggest-short' | 'improve' | 'smart-review' | 'grammar-check' | 'context-review' | 'quick-alternatives' | 'auto-correct' | 'detect-weak' | 'context-retranslate';
        aiModel?: string;
        contextEntries?: { key: string; original: string; translation: string }[];
      };

      // Map aiModel to gateway model name
      const gatewayModelMap: Record<string, string> = {
        'gemini-2.5-flash': 'google/gemini-2.5-flash',
        'gemini-2.5-pro': 'google/gemini-2.5-pro',
        'gemini-3.1-pro-preview': 'google/gemini-3.1-pro-preview',
        'gpt-5': 'openai/gpt-5',
      };
      const resolvedModel = (aiModel && gatewayModelMap[aiModel]) || 'google/gemini-2.5-flash';

     if (!entries || entries.length === 0) {
       return new Response(JSON.stringify({ issues: [] }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }

     // --- Handle "suggest short translations" action ---
     if (action === 'suggest-short') {
       const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
       if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

       const tooLongEntries = entries.filter(e => {
         const bytes = getUtf16ByteLength(e.translation);
         return bytes > e.maxBytes && e.maxBytes > 0;
       });

       if (tooLongEntries.length === 0) {
         return new Response(JSON.stringify({ suggestions: [] }), {
           headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         });
       }

        const prompt = `أنت مترجم ألعاب فيديو متخصص في الاختصار. مهمتك: اختصار كل ترجمة لتصبح أقل من الحد المسموح بالبايت.

قواعد صارمة:
- يجب أن تكون الترجمة المقترحة مختلفة وأقصر فعلياً من الحالية
- لا تُعِد نفس النص أبداً - استخدم مرادفات أقصر، احذف كلمات زائدة، أعد صياغة الجملة
- حافظ على جميع الوسوم [Tags] كما هي بدون تغيير
- حافظ على المعنى الأساسي
- كل حرف عربي = 2 بايت في UTF-16

${tooLongEntries.map((e, i) => {
          const currentBytes = getUtf16ByteLength(e.translation);
          const charsToRemove = Math.ceil((currentBytes - e.maxBytes) / 2);
          return `[${i}] الأصلي: "${e.original}"
الترجمة الحالية (${currentBytes} بايت): "${e.translation}"
الحد الأقصى: ${e.maxBytes} بايت — يجب حذف ${charsToRemove} حرف على الأقل`;
        }).join('\n\n')}

أخرج JSON array فقط بنفس الترتيب. مثال: ["ترجمة مختصرة 1", "ترجمة مختصرة 2"]`;

       const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${LOVABLE_API_KEY}`,
           'Content-Type': 'application/json',
         },
         body: JSON.stringify({
            model: resolvedModel,
           messages: [
             { role: 'system', content: 'أنت متخصص في اختصار النصوص. اخرج ONLY JSON arrays.' },
             { role: 'user', content: prompt },
           ],
          }),
        });

       if (!response.ok) {
          const err = await response.text();
         console.error('AI gateway error:', err);
         throw new Error(`AI error: ${response.status}`);
       }

       const data = await response.json();
       const content = data.choices?.[0]?.message?.content || '';
       const jsonMatch = content.match(/\[[\s\S]*\]/);
       if (!jsonMatch) throw new Error('Failed to parse AI response');

       const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
       const suggestions: string[] = JSON.parse(sanitized);

       const result = tooLongEntries.map((entry, i) => ({
         key: entry.key,
         original: entry.original,
         current: entry.translation,
         currentBytes: getUtf16ByteLength(entry.translation),
         maxBytes: entry.maxBytes,
         suggested: suggestions[i] || entry.translation,
         suggestedBytes: getUtf16ByteLength(suggestions[i] || entry.translation),
       }));

       return new Response(JSON.stringify({ suggestions: result }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }

      // --- Handle "smart-review" action (AI deep analysis) ---
      if (action === 'smart-review') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const translatedEntries = entries.filter(e => e.translation?.trim());
        if (translatedEntries.length === 0) {
          return new Response(JSON.stringify({ findings: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const CHUNK_SIZE = 15;
        const allFindings: any[] = [];

        for (let c = 0; c < translatedEntries.length; c += CHUNK_SIZE) {
          const chunk = translatedEntries.slice(c, c + CHUNK_SIZE);

          const prompt = `أنت مدقق لغوي متخصص في ترجمة ألعاب الفيديو (Xenoblade Chronicles 3). حلّل كل ترجمة وأبلغ عن المشاكل التالية فقط:

1. **literal** — ترجمة حرفية جامدة لا تبدو طبيعية بالعربية (مثل "اذهب إلى الأمام" بدل "تقدّم")
2. **grammar** — خطأ نحوي أو صرفي (تذكير/تأنيث خاطئ، تصريف أفعال، إعراب)
3. **inconsistency** — مصطلح مترجم بشكل مختلف عن المتوقع حسب سياق اللعبة
4. **naturalness** — صياغة ركيكة يمكن تحسينها لتبدو أكثر سلاسة

${glossary ? `\nالقاموس المعتمد (التزم به):\n${glossary.slice(0, 3000)}\n` : ''}

النصوص:
${chunk.map((e, i) => `[${i}] EN: "${e.original}"
AR: "${e.translation}"`).join('\n\n')}

أخرج JSON array فقط. كل عنصر:
{"i": رقم_النص, "type": "literal"|"grammar"|"inconsistency"|"naturalness", "issue": "وصف المشكلة بالعربية", "fix": "الترجمة المقترحة"}
إذا كان النص سليماً لا تضعه في النتائج. أخرج [] إذا لم تجد مشاكل.`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
               model: resolvedModel,
              messages: [
                { role: 'system', content: 'أنت مدقق لغوي دقيق. أخرج ONLY valid JSON arrays. لا تخرج أي شيء آخر.' },
                { role: 'user', content: prompt },
              ],
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول لاحقاً" }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            if (response.status === 402) {
              return new Response(JSON.stringify({ error: "يجب إضافة رصيد لاستخدام الذكاء الاصطناعي" }), {
                status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const err = await response.text();
            console.error('AI gateway error:', err);
            continue; // skip this chunk
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (!jsonMatch) continue;

          try {
            const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
            const findings: any[] = JSON.parse(sanitized);
            for (const f of findings) {
              if (typeof f.i === 'number' && f.i >= 0 && f.i < chunk.length) {
                allFindings.push({
                  key: chunk[f.i].key,
                  original: chunk[f.i].original,
                  current: chunk[f.i].translation,
                  type: f.type || 'naturalness',
                  issue: f.issue || '',
                  fix: f.fix || '',
                });
              }
            }
          } catch (e) {
            console.error('JSON parse error in smart-review chunk:', e);
          }
        }

        return new Response(JSON.stringify({ findings: allFindings }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Handle "grammar-check" action (dedicated grammar analysis) ---
      if (action === 'grammar-check') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const translatedEntries = entries.filter(e => e.translation?.trim());
        if (translatedEntries.length === 0) {
          return new Response(JSON.stringify({ findings: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const CHUNK_SIZE = 15;
        const allFindings: any[] = [];

        for (let c = 0; c < translatedEntries.length; c += CHUNK_SIZE) {
          const chunk = translatedEntries.slice(c, c + CHUNK_SIZE);

          const prompt = `أنت مدقق نحوي وإملائي متخصص في اللغة العربية. حلّل كل ترجمة وأبلغ عن الأخطاء التالية فقط:

1. **gender** — خطأ في التذكير والتأنيث (مثل: "هذا القرية" بدل "هذه القرية")
2. **conjugation** — خطأ في تصريف الفعل (مثل: "هم ذهب" بدل "هم ذهبوا")
3. **case** — خطأ إعرابي (مثل: "رأيت الرجلُ" بدل "رأيت الرجلَ")
4. **spelling** — خطأ إملائي (مثل: "إنشاء الله" بدل "إن شاء الله"، "لاكن" بدل "لكن")
5. **hamza** — خطأ في الهمزات (مثل: "مسائل" بدل "مسائل"، "إنتصار" بدل "انتصار")
6. **negation** — خطأ في أداة النفي (مثل: "ل يمكن" بدل "لا يمكن"، "ل تذهب" بدل "لا تذهب")
7. **preposition** — خطأ في حرف الجر أو استخدامه

${glossary ? `\nالقاموس المعتمد:\n${glossary.slice(0, 2000)}\n` : ''}

النصوص:
${chunk.map((e, i) => `[${i}] EN: "${e.original}"
AR: "${e.translation}"`).join('\n\n')}

أخرج JSON array فقط. كل عنصر:
{"i": رقم_النص, "type": "gender"|"conjugation"|"case"|"spelling"|"hamza"|"negation"|"preposition", "issue": "شرح الخطأ", "fix": "الترجمة المصحّحة"}
إذا كان النص سليماً لا تضعه. أخرج [] إذا لم تجد أخطاء.`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              messages: [
                { role: 'system', content: 'أنت مدقق نحوي وإملائي دقيق. أخرج ONLY valid JSON arrays.' },
                { role: 'user', content: prompt },
              ],
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول لاحقاً" }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const err = await response.text();
            console.error('AI gateway error:', err);
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (!jsonMatch) continue;

          try {
            const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
            const findings: any[] = JSON.parse(sanitized);
            for (const f of findings) {
              if (typeof f.i === 'number' && f.i >= 0 && f.i < chunk.length) {
                allFindings.push({
                  key: chunk[f.i].key,
                  original: chunk[f.i].original,
                  current: chunk[f.i].translation,
                  type: f.type || 'spelling',
                  issue: f.issue || '',
                  fix: f.fix || '',
                });
              }
            }
          } catch (e) {
            console.error('JSON parse error in grammar-check chunk:', e);
          }
        }

        return new Response(JSON.stringify({ findings: allFindings }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Handle "context-review" action (context-aware translation improvement) ---
      if (action === 'context-review') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const translatedEntries = entries.filter(e => e.translation?.trim());
        if (translatedEntries.length === 0) {
          return new Response(JSON.stringify({ findings: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const CHUNK_SIZE = 10;
        const allFindings: any[] = [];

        for (let c = 0; c < translatedEntries.length; c += CHUNK_SIZE) {
          const chunk = translatedEntries.slice(c, c + CHUNK_SIZE);

          // Build context: include surrounding entries for each chunk entry
          const contextBlock = contextEntries && contextEntries.length > 0
            ? `\nسياق إضافي (نصوص مجاورة من نفس الملف):\n${contextEntries.slice(0, 30).map(ce => `  "${ce.original}" → "${ce.translation}"`).join('\n')}\n`
            : '';

          const prompt = `أنت مراجع ترجمات ألعاب فيديو متخصص في السياق. مهمتك: تحليل كل ترجمة في سياقها (الجمل المحيطة والأحداث) وتحسينها.

المشاكل التي يجب كشفها:
1. **context-mismatch** — الترجمة صحيحة لغوياً لكنها لا تناسب سياق اللعبة أو المشهد
2. **tone-mismatch** — نبرة الحوار لا تناسب الشخصية المتحدثة (رسمي جداً، عامي جداً)
3. **ambiguity** — الترجمة غامضة وقد تُفهم بشكل خاطئ في سياق اللعبة
4. **continuity** — عدم اتساق مع الجمل المجاورة (تغيّر ضمير، تناقض معلومة)
5. **improvement** — اقتراح تحسين للصياغة بناءً على فهم السياق

${glossary ? `\nالقاموس المعتمد:\n${glossary.slice(0, 2000)}\n` : ''}
${contextBlock}

النصوص للمراجعة:
${chunk.map((e, i) => `[${i}] EN: "${e.original}"
AR: "${e.translation}"`).join('\n\n')}

أخرج JSON array فقط. كل عنصر:
{"i": رقم_النص, "type": "context-mismatch"|"tone-mismatch"|"ambiguity"|"continuity"|"improvement", "issue": "وصف المشكلة بالعربية", "fix": "الترجمة المحسّنة بناءً على السياق"}
أخرج [] إذا لم تجد مشاكل سياقية.`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              messages: [
                { role: 'system', content: 'أنت مراجع سياقي متخصص. أخرج ONLY valid JSON arrays.' },
                { role: 'user', content: prompt },
              ],
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات، حاول لاحقاً" }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const err = await response.text();
            console.error('AI gateway error:', err);
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (!jsonMatch) continue;

          try {
            const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
            const findings: any[] = JSON.parse(sanitized);
            for (const f of findings) {
              if (typeof f.i === 'number' && f.i >= 0 && f.i < chunk.length) {
                allFindings.push({
                  key: chunk[f.i].key,
                  original: chunk[f.i].original,
                  current: chunk[f.i].translation,
                  type: f.type || 'improvement',
                  issue: f.issue || '',
                  fix: f.fix || '',
                });
              }
            }
          } catch (e) {
            console.error('JSON parse error in context-review chunk:', e);
          }
        }

        return new Response(JSON.stringify({ findings: allFindings }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Handle "quick-alternatives" action (3 alternatives for a single entry) ---
      if (action === 'quick-alternatives') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const entry = entries[0];
        if (!entry?.translation?.trim()) {
          return new Response(JSON.stringify({ alternatives: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const contextBlock = contextEntries && contextEntries.length > 0
          ? `\nسياق (نصوص مجاورة):\n${contextEntries.slice(0, 10).map(ce => `  "${ce.original}" → "${ce.translation}"`).join('\n')}\n`
          : '';

        const prompt = `أنت مترجم ألعاب فيديو محترف. أعطني 3 بدائل مختلفة للترجمة التالية بأساليب متنوعة:

النص الأصلي: "${entry.original}"
الترجمة الحالية: "${entry.translation}"
${entry.maxBytes > 0 ? `الحد الأقصى: ${entry.maxBytes} بايت (كل حرف = 2 بايت)` : ''}

${glossary ? `القاموس:\n${glossary.slice(0, 1500)}\n` : ''}
${contextBlock}

قدم 3 بدائل بأساليب مختلفة:
1. 💬 طبيعي وسلس
2. ✂️ مختصر ومباشر  
3. 📚 أدبي وغني

أخرج JSON array فقط بـ 3 عناصر. كل عنصر: {"style": "natural"|"concise"|"literary", "text": "الترجمة البديلة", "reason": "سبب قصير"}`;

        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: resolvedModel,
            messages: [
              { role: 'system', content: 'أنت مترجم ألعاب. أخرج ONLY valid JSON arrays.' },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات" }), {
              status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          const err = await response.text();
          console.error('AI gateway error:', err);
          throw new Error(`AI error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('Failed to parse AI response');

        const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
        const alternatives = JSON.parse(sanitized);

        return new Response(JSON.stringify({ alternatives }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Handle "auto-correct" action (bulk spelling/grammar auto-fix) ---
      if (action === 'auto-correct') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const translatedEntries = entries.filter(e => e.translation?.trim());
        if (translatedEntries.length === 0) {
          return new Response(JSON.stringify({ corrections: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const CHUNK_SIZE = 20;
        const allCorrections: any[] = [];

        for (let c = 0; c < translatedEntries.length; c += CHUNK_SIZE) {
          const chunk = translatedEntries.slice(c, c + CHUNK_SIZE);

          const prompt = `أنت مصحح إملائي ونحوي آلي. صحّح كل ترجمة عربية بدون تغيير المعنى أو الأسلوب.

قواعد:
- صحّح الأخطاء الإملائية والنحوية فقط
- لا تُغيّر الأسلوب أو الصياغة
- حافظ على جميع الوسوم [Tags] و الرموز الخاصة كما هي
- إذا كان النص سليماً أعد نفس النص بالضبط
- صحّح: همزات خاطئة، تاء/هاء، ياء/ألف مقصورة، تذكير/تأنيث، "ل" → "لا"

${chunk.map((e, i) => `[${i}] "${e.translation}"`).join('\n')}

أخرج JSON array فقط بنفس الترتيب يحتوي النصوص المصححة. مثال: ["نص مصحح 1", "نص مصحح 2"]`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              messages: [
                { role: 'system', content: 'أنت مصحح إملائي. أخرج ONLY JSON arrays. لا تغيّر المعنى.' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.1,
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات" }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const err = await response.text();
            console.error('AI gateway error:', err);
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (!jsonMatch) continue;

          try {
            const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
            const corrected: string[] = JSON.parse(sanitized);
            for (let i = 0; i < Math.min(chunk.length, corrected.length); i++) {
              const entry = chunk[i];
              const correctedText = corrected[i]?.trim();
              if (correctedText && correctedText !== entry.translation) {
                allCorrections.push({
                  key: entry.key,
                  original: entry.original,
                  current: entry.translation,
                  corrected: correctedText,
                });
              }
            }
          } catch (e) {
            console.error('JSON parse error in auto-correct chunk:', e);
          }
        }

        return new Response(JSON.stringify({ corrections: allCorrections }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Handle "detect-weak" action (detect weak/poor translations) ---
      if (action === 'detect-weak') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const translatedEntries = entries.filter(e => e.translation?.trim());
        if (translatedEntries.length === 0) {
          return new Response(JSON.stringify({ weakEntries: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const CHUNK_SIZE = 15;
        const allWeak: any[] = [];

        for (let c = 0; c < translatedEntries.length; c += CHUNK_SIZE) {
          const chunk = translatedEntries.slice(c, c + CHUNK_SIZE);

          const prompt = `أنت مراجع جودة ترجمات ألعاب. قيّم كل ترجمة وأعطها درجة من 1-10:
- 1-3: ركيكة/سيئة (ترجمة حرفية، أخطاء فادحة، غير مفهومة)
- 4-5: مقبولة لكن تحتاج تحسين
- 6-7: جيدة مع ملاحظات بسيطة
- 8-10: ممتازة (لا تضعها في النتائج)

${glossary ? `القاموس:\n${glossary.slice(0, 1500)}\n` : ''}

${chunk.map((e, i) => `[${i}] EN: "${e.original}"
AR: "${e.translation}"`).join('\n\n')}

أخرج JSON array فقط للترجمات بدرجة 7 أو أقل. كل عنصر:
{"i": رقم, "score": درجة_1_10, "reason": "سبب الدرجة المنخفضة", "suggestion": "ترجمة مقترحة أفضل"}
أخرج [] إذا كانت كل الترجمات ممتازة.`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              messages: [
                { role: 'system', content: 'أنت مقيّم جودة ترجمات. أخرج ONLY valid JSON arrays.' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.2,
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات" }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const err = await response.text();
            console.error('AI gateway error:', err);
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (!jsonMatch) continue;

          try {
            const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
            const findings: any[] = JSON.parse(sanitized);
            for (const f of findings) {
              if (typeof f.i === 'number' && f.i >= 0 && f.i < chunk.length) {
                allWeak.push({
                  key: chunk[f.i].key,
                  original: chunk[f.i].original,
                  current: chunk[f.i].translation,
                  score: f.score || 5,
                  reason: f.reason || '',
                  suggestion: f.suggestion || '',
                });
              }
            }
          } catch (e) {
            console.error('JSON parse error in detect-weak chunk:', e);
          }
        }

        // Sort by score ascending (worst first)
        allWeak.sort((a, b) => a.score - b.score);

        return new Response(JSON.stringify({ weakEntries: allWeak }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Handle "context-retranslate" action ---
      if (action === 'context-retranslate') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const translatedEntries = entries.filter(e => e.translation?.trim());
        if (translatedEntries.length === 0) {
          return new Response(JSON.stringify({ retranslations: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const contextBlock = contextEntries && contextEntries.length > 0
          ? `\nسياق من نفس المشهد/الملف:\n${contextEntries.slice(0, 20).map(ce => `  EN: "${ce.original}" → AR: "${ce.translation}"`).join('\n')}\n`
          : '';

        const CHUNK_SIZE = 10;
        const allRetranslations: any[] = [];

        for (let c = 0; c < translatedEntries.length; c += CHUNK_SIZE) {
          const chunk = translatedEntries.slice(c, c + CHUNK_SIZE);

          const prompt = `أنت مترجم ألعاب فيديو محترف. أعد ترجمة النصوص التالية مع مراعاة السياق المحيط.

${glossary ? `القاموس المعتمد (التزم به):\n${glossary.slice(0, 2000)}\n` : ''}
${contextBlock}

قواعد:
- استخدم السياق المحيط لفهم المشهد والشخصية المتحدثة
- قدّم ترجمة طبيعية وسلسة تناسب سياق اللعبة
- حافظ على جميع الوسوم [Tags] والرموز الخاصة
- الترجمة الحالية قد تكون حرفية أو ركيكة — حسّنها

${chunk.map((e, i) => `[${i}] EN: "${e.original}"
الترجمة الحالية: "${e.translation}"
${e.maxBytes > 0 ? `الحد: ${e.maxBytes} بايت` : ''}`).join('\n\n')}

أخرج JSON array فقط بنفس الترتيب. كل عنصر: {"text": "الترجمة الجديدة", "changes": "ملخص التغييرات"}`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              messages: [
                { role: 'system', content: 'أنت مترجم ألعاب متخصص. أخرج ONLY valid JSON arrays.' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.3,
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              return new Response(JSON.stringify({ error: "تم تجاوز حد الطلبات" }), {
                status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const err = await response.text();
            console.error('AI gateway error:', err);
            continue;
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (!jsonMatch) continue;

          try {
            const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
            const results: any[] = JSON.parse(sanitized);
            for (let i = 0; i < Math.min(chunk.length, results.length); i++) {
              const entry = chunk[i];
              const result = results[i];
              const newText = result?.text?.trim();
              if (newText && newText !== entry.translation) {
                allRetranslations.push({
                  key: entry.key,
                  original: entry.original,
                  current: entry.translation,
                  retranslated: newText,
                  changes: result.changes || '',
                });
              }
            }
          } catch (e) {
            console.error('JSON parse error in context-retranslate chunk:', e);
          }
        }

        return new Response(JSON.stringify({ retranslations: allRetranslations }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Handle "improve translations" action ---
      if (action === 'improve') {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

        const translatedEntries = entries.filter(e => e.translation?.trim());

        if (translatedEntries.length === 0) {
          return new Response(JSON.stringify({ improvements: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Process in chunks of 25
        const CHUNK_SIZE = 25;
        const allImprovements: any[] = [];

        for (let c = 0; c < translatedEntries.length; c += CHUNK_SIZE) {
          const chunk = translatedEntries.slice(c, c + CHUNK_SIZE);

          const prompt = `أنت مترجم ألعاب فيديو محترف متخصص في سلسلة زيلدا. مهمتك: إعادة صياغة وتحسين كل ترجمة عربية بشكل ملحوظ.

قواعد صارمة:
- يجب أن تقدم صياغة مختلفة وأفضل لكل نص — لا تُعِد نفس النص أبداً
- أعد صياغة الجملة بالكامل بأسلوب عربي طبيعي وسلس كأنها كُتبت بالعربية أصلاً
- صحّح أي أخطاء نحوية أو إملائية أو ركاكة في الأسلوب
- استخدم مفردات أغنى وأدق — تجنب الترجمة الحرفية
- استخدم مصطلحات مجتمع الألعاب العربي المعروفة (مثل: تريفورس، سيف الماستر، هايرول)
- حافظ على جميع الوسوم [Tags] و ￼ كما هي بدون أي تغيير
- حافظ على طول الترجمة قريباً من الأصل لتناسب صناديق النص في اللعبة
- الحد الأقصى بالبايت مذكور لكل نص — لا تتجاوزه (كل حرف عربي = 2 بايت)
- لا تترجم الأسماء العلم المعروفة (Link, Zelda, Ganon) إلا إذا كان لها مقابل عربي شائع
- حتى لو كانت الترجمة جيدة، قدّم بديلاً أفضل أو مختلفاً في الأسلوب

${glossary ? `\nالقاموس:\n${glossary}\n` : ''}

${chunk.map((e, i) => `[${i}] الأصلي: "${e.original}"
الترجمة الحالية: "${e.translation}"
الحد: ${e.maxBytes} بايت`).join('\n\n')}

أخرج JSON array فقط بنفس الترتيب يحتوي الترجمات المحسّنة. مثال: ["ترجمة محسنة 1", "ترجمة محسنة 2"]`;

          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: resolvedModel,
              messages: [
                { role: 'system', content: 'أنت محسّن ترجمات ألعاب. أخرج ONLY JSON arrays.' },
                { role: 'user', content: prompt },
              ],
              temperature: 0.4,
            }),
          });

          if (!response.ok) {
            const err = await response.text();
            console.error('AI gateway error:', err);
            throw new Error(`AI error: ${response.status}`);
          }

          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (!jsonMatch) throw new Error('Failed to parse AI response');

          const sanitized = jsonMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ');
          const improved: string[] = JSON.parse(sanitized);

          for (let i = 0; i < Math.min(chunk.length, improved.length); i++) {
            const entry = chunk[i];
            const improvedText = improved[i]?.trim();
            if (improvedText && improvedText !== entry.translation) {
              allImprovements.push({
                key: entry.key,
                original: entry.original,
                current: entry.translation,
                currentBytes: getUtf16ByteLength(entry.translation),
                maxBytes: entry.maxBytes,
                improved: improvedText,
                improvedBytes: getUtf16ByteLength(improvedText),
              });
            }
          }
        }

        return new Response(JSON.stringify({ improvements: allImprovements }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- Default review action ---
     const issues: ReviewIssue[] = [];

    // Parse glossary for consistency checks
    const glossaryMap = new Map<string, string>();
    if (glossary) {
      for (const line of glossary.split('\n')) {
        const match = line.match(/^(.+?)\s*=\s*(.+)$/);
        if (match) {
          glossaryMap.set(match[1].trim().toLowerCase(), match[2].trim());
        }
      }
    }

    // Build translation consistency map (same original → same translation)
    const translationsByOriginal = new Map<string, { key: string; translation: string }[]>();

    for (const entry of entries) {
      if (!entry.translation?.trim()) continue;

      // 1. Missing tags check
      const originalTags = extractTags(entry.original);
      const translationTags = extractTags(entry.translation);
      
      for (const tag of originalTags) {
        if (!entry.translation.includes(tag)) {
          issues.push({
            key: entry.key,
            type: 'missing_tag',
            severity: 'error',
            message: `وسم مفقود في الترجمة: ${tag}`,
            suggestion: `أضف ${tag} في الموضع المناسب`,
          });
        }
      }

      // 2. Placeholder mismatch
      const origPlaceholders = extractPlaceholders(entry.original);
      const transPlaceholders = extractPlaceholders(entry.translation);
      if (origPlaceholders.length !== transPlaceholders.length) {
        issues.push({
          key: entry.key,
          type: 'placeholder_mismatch',
          severity: 'error',
          message: `عدد العناصر النائبة (￼) مختلف: الأصلي ${origPlaceholders.length}، الترجمة ${transPlaceholders.length}`,
        });
      }

      // 3. Text too long (byte limit)
      if (entry.maxBytes > 0) {
        const translationBytes = getUtf16ByteLength(entry.translation);
        const ratio = translationBytes / entry.maxBytes;
        if (ratio > 1) {
          issues.push({
            key: entry.key,
            type: 'too_long',
            severity: 'error',
            message: `الترجمة تتجاوز الحد (${translationBytes}/${entry.maxBytes} بايت) — لن يتم حقنها`,
            suggestion: `اختصر الترجمة بـ ${translationBytes - entry.maxBytes} بايت`,
          });
        } else if (ratio > 0.8) {
          issues.push({
            key: entry.key,
            type: 'too_long',
            severity: 'warning',
            message: `الترجمة قريبة من الحد (${Math.round(ratio * 100)}% من المساحة المتاحة)`,
          });
        }
      }

      // 4. Track for consistency
      const normOriginal = entry.original.trim().toLowerCase();
      if (!translationsByOriginal.has(normOriginal)) {
        translationsByOriginal.set(normOriginal, []);
      }
      translationsByOriginal.get(normOriginal)!.push({ key: entry.key, translation: entry.translation });

      // 5. Glossary term check
      for (const [term, expected] of glossaryMap) {
        if (entry.original.toLowerCase().includes(term) && !entry.translation.includes(expected)) {
          issues.push({
            key: entry.key,
            type: 'untranslated_term',
            severity: 'warning',
            message: `مصطلح "${term}" يجب أن يُترجم إلى "${expected}" حسب القاموس`,
            suggestion: expected,
          });
        }
      }

      // 6. Remaining English text detection
      // Skip proper nouns, button abbreviations, technical symbols, and short words
      const ZELDA_PROPER_NOUNS = new Set([
        'link', 'zelda', 'ganon', 'ganondorf', 'hyrule', 'navi', 'epona', 'triforce',
        'sheikah', 'goron', 'zora', 'gerudo', 'rito', 'korok', 'bokoblin', 'moblin',
        'lynel', 'hinox', 'guardian', 'malice', 'calamity', 'master', 'sword',
        'purah', 'impa', 'robbie', 'sidon', 'mipha', 'daruk', 'revali', 'urbosa',
        'rauru', 'sonia', 'mineru', 'tulin', 'yunobo', 'riju',
      ]);

      // Button abbreviations and technical symbols commonly left in Arabic text
      const BUTTON_ABBREVIATIONS = new Set([
        // Controller buttons
        'a', 'b', 'x', 'y', 'l', 'r', 'zl', 'zr', 'ls', 'rs',
        'lb', 'rb', 'lt', 'rt', 'up', 'down', 'left', 'right',
        // Common abbreviations
        'hp', 'mp', 'sp', 'atk', 'def', 'exp', 'lvl', 'lv', 'max',
        'min', 'dmg', 'dps', 'crit', 'xp', 'buff', 'debuff',
        // UI terms commonly left
        'ui', 'fps', 'hud', 'api', 'fps', 'rng', 'ai', 'npc',
        // Common game words variants
        'bow', 'map', 'key', 'item', 'shop', 'save', 'load', 'quit',
        'menu', 'back', 'next', 'ok', 'yes', 'no', 'on', 'off',
        // Tech symbols and codes
        'rgb', 'hex', 'var', 'def', 'fn', 'obj', 'arr', 'etc',
        // Very common short English prepositions/particles
        'of', 'to', 'in', 'at', 'by', 'or', 'an', 'is', 'as',
      ]);

      // Strip tags [Tag:Value] before scanning for English words
      const textWithoutTags = entry.translation.replace(/\[[^\]]*\]/g, '');
      const englishWords = textWithoutTags.match(/[a-zA-Z]{2,}/g) || [];
      const remainingEnglish = englishWords.filter(w => {
        const lower = w.toLowerCase();
        return (
          !ZELDA_PROPER_NOUNS.has(lower) && 
          !BUTTON_ABBREVIATIONS.has(lower) && 
          lower.length > 2
        );
      });

      if (remainingEnglish.length > 0) {
        issues.push({
          key: entry.key,
          type: 'remaining_english',
          severity: 'warning',
          message: `كلمات إنجليزية متبقية: ${remainingEnglish.slice(0, 5).join(', ')}`,
          suggestion: 'تحقق من ترجمة هذه الكلمات أو أنها مصطلحات فنية معترف بها',
        });
      }
    }

    // 6. Consistency check: same original text → different translations
    for (const [original, translations] of translationsByOriginal) {
      if (translations.length > 1) {
        const uniqueTranslations = new Set(translations.map(t => t.translation.trim()));
        if (uniqueTranslations.size > 1) {
          for (const t of translations) {
            issues.push({
              key: t.key,
              type: 'inconsistent',
              severity: 'warning',
              message: `نفس النص الأصلي مترجم بأشكال مختلفة (${uniqueTranslations.size} ترجمات مختلفة)`,
              suggestion: translations[0].translation,
            });
          }
        }
      }
    }

    // Summary stats
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    return new Response(JSON.stringify({
      issues,
      summary: {
        total: issues.length,
        errors: errorCount,
        warnings: warningCount,
        checked: entries.length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Review error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'خطأ غير متوقع' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
