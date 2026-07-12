import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import getProject from "./tools/get-project";
import listGlossaries from "./tools/list-glossaries";
import getGlossary from "./tools/get-glossary";

// Direct supabase.co host is required for the OAuth issuer — the runtime
// SUPABASE_URL may be a proxy. Built from the project ref at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "arabic-translation-tool-mcp",
  title: "Arabic Game Translation Tool",
  version: "0.1.0",
  instructions:
    "أدوات للوصول إلى مشاريع الترجمة العربية والقواميس المحفوظة للمستخدم الحالي. " +
    "Tools to read the signed-in user's Arabic translation projects and glossaries.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjects, getProject, listGlossaries, getGlossary],
});
