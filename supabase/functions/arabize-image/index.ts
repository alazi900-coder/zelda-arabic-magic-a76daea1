import { corsHeaders } from "@supabase/supabase-js/cors";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
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

    // Use Gemini image editing model to replace English text with Arabic
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are an expert Arabic localizer for video game UI textures. 
Look at this game UI texture image. Find ALL English text in it and replace each piece of text with its accurate Arabic translation.

CRITICAL RULES:
- Keep the EXACT same visual style: same font size, color, position, background
- Arabic text should be right-to-left
- Do NOT change any non-text elements (icons, borders, backgrounds, graphics)
- If there is no English text, return the image unchanged
- Make the Arabic text look natural and professional as if the game was originally in Arabic
- Translate game UI terms accurately (e.g., "HP" → "نقاط الصحة", "Attack" → "هجوم", "Items" → "العناصر", "Save" → "حفظ", "Load" → "تحميل", "Settings" → "الإعدادات", "Quest" → "المهمة", etc.)
- Keep numbers as-is

Return ONLY the modified image with Arabic text.`,
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
      
      return new Response(JSON.stringify({ error: "ai_error", message: "فشل في معالجة الصورة" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const imageResult = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageResult) {
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
