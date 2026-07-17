/**
 * Curated catalog of free (SIL OFL–licensed) Arabic fonts, served straight
 * from the official google/fonts repository via the jsDelivr CDN (sends
 * `Access-Control-Allow-Origin: *`, so the browser can fetch the raw TTF
 * bytes directly — no backend involved). Every URL below was verified to
 * return HTTP 200 before being listed.
 *
 * The bytes plug straight into the existing pipeline: use a catalog font as
 * the PRIMARY generation font or as the ALTERNATE font for per-letter glyph
 * replacement (risen2-arabic-font-gen.ts) — nothing font-library-specific
 * happens downstream.
 */

export interface FreeFontEntry {
  id: string;
  /** Display name (Arabic UI). */
  name: string;
  /** Short style descriptor shown next to the name. */
  style: string;
  url: string;
}

export const FREE_ARABIC_FONTS: FreeFontEntry[] = [
  { id: "cairo", name: "Cairo", style: "حديث واضح — عناوين وواجهات", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/cairo/Cairo%5Bslnt,wght%5D.ttf" },
  { id: "amiri", name: "Amiri Bold", style: "نسخ تقليدي أنيق", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Bold.ttf" },
  { id: "notonaskh", name: "Noto Naskh", style: "نسخ متوازن عالي الوضوح", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf" },
  { id: "tajawal", name: "Tajawal Bold", style: "عصري هندسي", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/tajawal/Tajawal-Bold.ttf" },
  { id: "almarai", name: "Almarai Bold", style: "عصري مستدير", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/almarai/Almarai-Bold.ttf" },
  { id: "scheherazade", name: "Scheherazade Bold", style: "نسخ كلاسيكي غني", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/scheherazadenew/ScheherazadeNew-Bold.ttf" },
  { id: "reemkufi", name: "Reem Kufi", style: "كوفي هندسي — عناوين", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/reemkufi/ReemKufi%5Bwght%5D.ttf" },
  { id: "elmessiri", name: "El Messiri", style: "أنيق شبه مائل", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/elmessiri/ElMessiri%5Bwght%5D.ttf" },
  { id: "harmattan", name: "Harmattan Bold", style: "بسيط مقروء", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/harmattan/Harmattan-Bold.ttf" },
  { id: "lalezar", name: "Lalezar", style: "عريض للعناوين الضخمة", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lalezar/Lalezar-Regular.ttf" },
  { id: "changa", name: "Changa", style: "حديث مضغوط", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/changa/Changa%5Bwght%5D.ttf" },
  { id: "mada", name: "Mada", style: "هندسي نظيف", url: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mada/Mada%5Bwght%5D.ttf" },
];

/** Fetches a catalog font's raw TTF bytes (browser fetch, CORS-enabled CDN). */
export async function fetchFreeFontBytes(entry: FreeFontEntry): Promise<ArrayBuffer> {
  const res = await fetch(entry.url);
  if (!res.ok) throw new Error(`فشل تحميل الخط ${entry.name} (HTTP ${res.status}) — تحقق من اتصال الإنترنت`);
  return res.arrayBuffer();
}
