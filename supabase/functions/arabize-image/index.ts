const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, context } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contextHint = context ? `\nسياق الصورة: ${context}` : "";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `أنت مترجم محترف لواجهات ألعاب الفيديو من الإنجليزية إلى العربية.

المهمة: انظر إلى هذه الصورة من واجهة لعبة فيديو. ابحث عن كل النصوص الإنجليزية واستبدلها بترجمتها العربية الدقيقة.${contextHint}

القواعد الصارمة:
1. حافظ على نفس الخط والحجم واللون والموضع والخلفية تماماً
2. النص العربي يكون من اليمين لليسار
3. لا تغير أي عنصر غير نصي (أيقونات، حدود، خلفيات، رسومات)
4. إذا لم يوجد نص إنجليزي، أعد الصورة كما هي بدون تغيير
5. الأرقام تبقى كما هي
6. الترجمة يجب أن تكون طبيعية وكأن اللعبة صُممت أصلاً بالعربية
7. لا تضف أي نص جديد غير موجود في الصورة الأصلية

أمثلة ترجمات شائعة في الألعاب:
- HP → نقاط الصحة | Attack → هجوم | Defense → دفاع
- Items → العناصر | Equipment → التجهيزات | Skills → المهارات
- Save → حفظ | Load → تحميل | Settings → الإعدادات
- Quest → المهمة | Map → الخريطة | Party → الفريق
- Level → المستوى | Experience → الخبرة | Status → الحالة
- Start → ابدأ | Continue → متابعة | New Game → لعبة جديدة
- Inventory → المخزون | Shop → المتجر | Inn → النُزل

أعد الصورة المعدلة فقط.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        modalities: ["image", "text"],
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required", message: "يرجى شحن رصيد AI" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "ai_error", message: `فشل: ${response.status}` }), {
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

    const imageResult = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageResult) {
      console.error("No image in response. Keys:", JSON.stringify(Object.keys(data)), "choices:", JSON.stringify(data.choices?.length));
      return new Response(JSON.stringify({ error: "no_image", message: "لم يتم إنتاج صورة معدلة" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageBase64: imageResult }), {
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
