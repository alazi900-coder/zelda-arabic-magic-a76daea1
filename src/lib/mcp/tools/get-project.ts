import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_project",
  title: "Get translation project",
  description: "Return a single translation project by id, including its translations map.",
  inputSchema: {
    id: z.string().uuid().describe("Project id (uuid)."),
    entriesLimit: z.number().int().min(1).max(2000).optional().describe("Cap the number of entries returned in the translations map (default 500). The full entry count is always reported."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, entriesLimit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await sb(ctx)
      .from("translation_projects")
      .select("id, name, entry_count, translated_count, translations, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Project not found" }], isError: true };

    const cap = entriesLimit ?? 500;
    let translations = data.translations as Record<string, unknown> | null;
    let truncated = false;
    if (translations && typeof translations === "object") {
      const keys = Object.keys(translations);
      if (keys.length > cap) {
        const trimmed: Record<string, unknown> = {};
        for (const k of keys.slice(0, cap)) trimmed[k] = translations[k];
        translations = trimmed;
        truncated = true;
      }
    }

    const out = { ...data, translations, truncated };
    return {
      content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      structuredContent: out,
    };
  },
});
