const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type GlossaryEntry = {
  source: string;
  target: string;
};

const BUILT_IN_GLOSSARY: GlossaryEntry[] = [
  { source: "HP", target: "نقاط الصحة" },
  { source: "AP", target: "نقاط الفنون" },
  { source: "Attack", target: "هجوم" },
  { source: "Defense", target: "دفاع" },
  { source: "Items", target: "العناصر" },
  { source: "Equipment", target: "المعدات" },
  { source: "Skills", target: "المهارات" },
  { source: "Arts", target: "الفنون" },
  { source: "Save", target: "حفظ" },
  { source: "Load", target: "تحميل" },
  { source: "Settings", target: "الإعدادات" },
  { source: "Options", target: "الخيارات" },
  { source: "Quest", target: "مهمة" },
  { source: "Map", target: "الخريطة" },
  { source: "Party", target: "الفريق" },
  { source: "Party Skills", target: "مهارات الفريق" },
  { source: "Level", target: "المستوى" },
  { source: "Experience", target: "الخبرة" },
  { source: "Status", target: "الحالة" },
  { source: "Start", target: "ابدأ" },
  { source: "Continue", target: "متابعة" },
  { source: "New Game", target: "لعبة جديدة" },
  { source: "Inventory", target: "المخزون" },
  { source: "Shop", target: "المتجر" },
  { source: "Inn", target: "النُزل" },
  { source: "Hero", target: "بطل" },
  { source: "Class", target: "فئة" },
  { source: "Healer", target: "معالج" },
  { source: "Attacker", target: "مهاجم" },
  { source: "Defender", target: "صمّاد" },
  { source: "Tank", target: "الصمّاد" },
  { source: "Aggro", target: "الاستفزاز" },
  { source: "Combo", target: "كومبو" },
  { source: "Chain Attack", target: "هجوم متسلسل" },
  { source: "Collectible", target: "مقتنى" },
  { source: "Ether", target: "الأثير" },
  { source: "Rest Spot", target: "نقطة استراحة" },
  { source: "Soul Tree", target: "شجرة الروح" },
  { source: "Keves", target: "كيفيس" },
  { source: "Agnus", target: "أغنوس" },
  { source: "Pneuma", target: "نيوما" },
  { source: "Aegis", target: "الإيجيس" },
  { source: "Noah", target: "نوح" },
  { source: "Mio", target: "ميو" },
  { source: "Ethel", target: "إيثيل" },
  { source: "Reyn", target: "راين" },
  { source: "Aetia", target: "أيتيا" },
  { source: "Swordmarch", target: "مسيرة السيوف" },
  { source: "Ferronis Hulk", target: "هيكل فيرونيس" },
  { source: "Ferronis", target: "فيرونيس" },
  { source: "Ouroboros", target: "أوروبوروس" },
];

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeContext(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return normalizeText(raw).slice(0, 500);
}

function parseGlossary(raw: unknown): GlossaryEntry[] {
  if (typeof raw !== "string") return [];

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s*(?:=>|->|=|:|\|)\s*(.+)$/);
      if (!match) return null;

      const source = normalizeText(match[1]);
      const target = normalizeText(match[2]);
      if (!source || !target) return null;

      return { source, target };
    })
    .filter((entry): entry is GlossaryEntry => Boolean(entry))
    .slice(0, 100);
}

function buildGlossaryBlock(customGlossary: GlossaryEntry[]): string {
  const merged = new Map<string, GlossaryEntry>();

  for (const entry of BUILT_IN_GLOSSARY) {
    merged.set(entry.source.toLowerCase(), entry);
  }

  for (const entry of customGlossary) {
    merged.set(entry.source.toLowerCase(), entry);
  }

  const entries = Array.from(merged.values());
  if (entries.length === 0) return "";

  return `
قاموس مصطلحات إلزامي:
${entries.map(({ source, target }) => `- ${source} → ${target}`).join("\n")}

إذا ظهر أي مصطلح من هذه القائمة في الصورة، فاستخدم ترجمته المحددة حرفياً دون تغيير أو مرادفات، حتى لو كان داخل عبارة أطول.
`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, context, glossary } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contextHint = sanitizeContext(context) ? `\nسياق الصورة: ${sanitizeContext(context)}` : "";
    const glossaryHint = buildGlossaryBlock(parseGlossary(glossary));

    // Use Gemini API directly (free tier) instead of Lovable AI gateway
    const promptText = `أنت مترجم محترف لواجهات ألعاب الفيديو من الإنجليزية إلى العربية.

المهمة: انظر إلى هذه الصورة من واجهة لعبة فيديو. ابحث عن كل النصوص الإنجليزية واستبدلها بترجمتها العربية الدقيقة والطبيعية، مع الالتزام الصارم بالمصطلحات المعتمدة.${contextHint}

${glossaryHint}

القواعد الصارمة:
1. حافظ على نفس الخط والحجم واللون والموضع والخلفية تماماً
2. النص العربي يكون من اليمين لليسار
3. إذا ظهر مصطلح موجود في القاموس الإلزامي فاستعمل المقابل المحدد له حرفياً بدون اجتهاد أو مرادفات
4. إذا تكرر المصطلح نفسه أكثر من مرة فاستخدم نفس الترجمة تماماً في جميع المواضع
5. إذا كان النص عبارة مركبة فحافظ على بنية العبارة الأصلية مع استبدال المصطلحات المعتمدة فقط
6. لا تغير أي عنصر غير نصي (أيقونات، حدود، خلفيات، رسومات)
7. إذا لم يوجد نص إنجليزي، أعد الصورة كما هي بدون تغيير
8. الأرقام تبقى كما هي
9. الترجمة يجب أن تكون طبيعية وكأن اللعبة صُممت أصلاً بالعربية
10. إذا كان معنى المصطلح غير واضح وقد يؤدي التخمين إلى ترجمة خاطئة، فحافظ على المصطلح الإنجليزي بدلاً من اختراع ترجمة سيئة
11. لا تضف أي نص جديد غير موجود في الصورة الأصلية

مرجع سريع لمصطلحات الألعاب:
- HP → نقاط الصحة | Attack → هجوم | Defense → دفاع
- Items → العناصر | Equipment → المعدات | Skills → المهارات
- Save → حفظ | Load → تحميل | Settings → الإعدادات
- Quest → مهمة | Map → الخريطة | Party → الفريق
- Level → المستوى | Experience → الخبرة | Status → الحالة
- Start → ابدأ | Continue → متابعة | New Game → لعبة جديدة
- Inventory → المخزون | Shop → المتجر | Inn → النُزل
- Keves → كيفيس | Agnus → أغنوس | Ouroboros → أوروبوروس
- Ferronis → فيرونيس | Chain Attack → هجوم متسلسل | Arts → الفنون

أعد الصورة المعدلة فقط.`;

    // Extract base64 data without the data URI prefix for Gemini API
    const base64Data = imageBase64.startsWith("data:")
      ? imageBase64.split(",")[1]
      : imageBase64;
    
    // Detect mime type
    const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
          ],
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited", message: "تم تجاوز حد الطلبات، حاول لاحقاً" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "ai_error", message: `فشل Gemini API: ${response.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read full response body as text first to handle large base64 payloads
    const rawText = await response.text();
    
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("JSON parse failed, raw length:", rawText.length, "first 200:", rawText.substring(0, 200));
      return new Response(JSON.stringify({ error: "parse_error", message: "فشل تحليل استجابة AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gemini API returns: candidates[0].content.parts[] with inlineData
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

    if (!imagePart) {
      console.error("No image in response. Keys:", JSON.stringify(Object.keys(data)), "parts:", JSON.stringify(parts.length));
      return new Response(JSON.stringify({ error: "no_image", message: "لم يتم إنتاج صورة معدلة" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultBase64 = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

    return new Response(JSON.stringify({ imageBase64: resultBase64 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("arabize-image error:", e);
    return new Response(JSON.stringify({ error: "server_error", message: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
