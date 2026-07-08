/**
 * Arabic section labels for the Risen 1 images.pak browser, mirroring the
 * pattern in `risen/categories.ts` (deterministic classification from the
 * file's own folder structure, unknown folders keep their raw name instead
 * of falling into a generic bucket).
 *
 * `NoMip/Special_LoadingHint_*` is split out of its real folder (NoMip/) into
 * its own virtual section by filename prefix, per the spec: it's the primary
 * localization target (loading-screen hint images with painted-in English
 * text) and shouldn't be buried among NoMip's other (non-localizable) textures.
 */

import type { RisenPakFlatFile } from "@/lib/risen-images-pak";

export type ImageSectionGroup = "localization" | "other";

export interface ImageSection {
  id: string;
  label: string;
  emoji: string;
  note?: string;
  group: ImageSectionGroup;
}

export interface ImageSectionCount extends ImageSection {
  count: number;
}

const LOADING_HINT_PREFIX = "Special_LoadingHint_";

const LOCALIZATION_SECTIONS: Record<string, ImageSection> = {
  "loading-hints": {
    id: "loading-hints",
    label: "شاشات التحميل (نصائح مكتوبة)",
    emoji: "🖼️",
    note: "صور فيها نص إنجليزي مرسوم — الهدف الرئيسي",
    group: "localization",
  },
  gui: {
    id: "gui",
    label: "صور الواجهة",
    emoji: "🎛️",
    note: "أزرار وأيقونات وخلفية القائمة",
    group: "localization",
  },
  achievements: {
    id: "achievements",
    label: "أيقونات الإنجازات",
    emoji: "🏆",
    note: "راجعها بحثًا عن نصوص",
    group: "localization",
  },
};

const OTHER_FOLDER_LABELS: Record<string, string> = {
  Level: "تكسترات المستويات",
  Special: "مؤثرات خاصة",
  lightmaps: "خرائط الإضاءة",
  Sky: "صور السماء",
  Speedtree: "الأشجار والنباتات",
  EditSupporter: "أدوات المطورين",
  Testkram: "ملفات تجريبية",
  Animation: "صور الحركات",
  NoMip: "ملفات NoMip الأخرى",
};

function topFolderOf(path: string): string {
  const idx = path.indexOf("/");
  return idx === -1 ? path : path.slice(0, idx);
}

function baseNameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Classifies a single flattened images.pak path into its display section. */
export function classifyImagePath(path: string): ImageSection {
  const top = topFolderOf(path);

  if (top === "NoMip" && baseNameOf(path).startsWith(LOADING_HINT_PREFIX)) {
    return LOCALIZATION_SECTIONS["loading-hints"];
  }
  if (top === "GUI") return LOCALIZATION_SECTIONS.gui;
  if (top === "achievements") return LOCALIZATION_SECTIONS.achievements;

  const otherLabel = OTHER_FOLDER_LABELS[top];
  if (otherLabel) {
    return { id: `other-${top.toLowerCase()}`, label: otherLabel, emoji: "📁", group: "other" };
  }
  // Unknown folder: raw name as-is, still grouped under "other".
  return { id: `other-${top.toLowerCase()}`, label: top, emoji: "📁", group: "other" };
}

/** Builds the section list (with counts) actually present among the given files, split by group. */
export function buildImageSections(files: RisenPakFlatFile[]): {
  localization: ImageSectionCount[];
  other: ImageSectionCount[];
} {
  const counts = new Map<string, ImageSectionCount>();
  for (const f of files) {
    const section = classifyImagePath(f.path);
    const existing = counts.get(section.id);
    if (existing) existing.count++;
    else counts.set(section.id, { ...section, count: 1 });
  }
  const all = Array.from(counts.values());
  return {
    localization: all.filter((s) => s.group === "localization").sort((a, b) => b.count - a.count),
    other: all.filter((s) => s.group === "other").sort((a, b) => b.count - a.count),
  };
}
