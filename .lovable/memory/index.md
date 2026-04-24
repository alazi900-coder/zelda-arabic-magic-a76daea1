# Memory: index.md
Updated: today

# Project Memory

## Core
- Mobile-first PWA UI. Use `accept="*/*"` for file pickers to open File Manager instead of Gallery.
- Lovable AI Gateway does not support `temperature` param (causes 500 error). Use Gemini via `GEMINI_API_KEY` for fallback.
- Xenoblade: Strip Arabic diacritics on build (no GPOS support). BDAT + TTF mods must reside in same `romfs` folder.
- Danganronpa: Do NOT apply BiDi reversal or reshaping (uses UTF-16LE / .po natively).
- Wilay Textures: Strictly preserve the original compression format (BC1/BC3/BC4/BC7/RGBA8).
- Bulk operations MUST respect the active filter (`isFilterActive` check).
- Supabase Edge: Use `src/lib/supabase-edge.ts` for unified authorization headers.
- Translation history util lives at `src/lib/translation-history.ts` (not in TranslationToolsPanel).
- OpenRouter has automatic fallback chain: tries 5 free models on 404/429 — surfaces toast `fallbackUsed`.

## Memories
- [BDAT Engine Master](mem://technical/bdat-engine-master) — XC3 binary logic, hashes, structural fingerprinting
- [Legacy BDAT Format](mem://technical/bdat-legacy-format-v4) — XC1 DE / XC2 legacy index table sentinel logic
- [XC1 DE High-Risk Tables](mem://constraints/xc1-de-high-risk-tables) — Auto-restoration of critical tables (MNU_style_, BTL_skilllist_)
- [Build Safety Gates](mem://technical/build-safety-gate-and-repair-v4) — 5-layer build tag guard and variable repair logic
- [Advanced Tag Safety](mem://technical/xc-series-advanced-tag-safety-v2) — TAG_PATTERNS and TAG_SHIELD_PATTERN logic
- [Hybrid Tag Restoration](mem://technical/hybrid-tag-restoration-logic) — Restoring embedded Arabic text inside technical tags
- [Pokemon SV Parser](mem://technical/pokemon-sv-advanced-parser) — .dat/.tbl XOR (0x7C89), zstd decode, dual-extraction
- [Pokemon SV State Transfer](mem://technical/pokemon-state-migration-logic) — `freshExtraction` IndexedDB handoff
- [Pokemon SV Duplicate Prevention](mem://technical/pokemon-upload-duplicate-prevention) — Deleting existing base names on upload
- [Danganronpa Extraction](mem://technical/danganronpa-recursive-extraction) — PAK0 / LIN0 nested extraction
- [Danganronpa Rebuild](mem://technical/danganronpa-rebuild-logic) — patchPoBuffer, Sequential Indexing, Total Shift
- [Danganronpa Categories](mem://features/danganronpa/categorization-system) — 14 regex-based file categories
- [Danganronpa Namespace](mem://technical/danganronpa-namespace-isolation) — `ArchiveName:FileName:Index` collision prevention
- [Translation Engine Logic](mem://technical/translation-engine-architecture) — Gemini batching, term locking, keyed JSON mapping
- [AI Resilience Logic](mem://technical/translation-ai-resilience-logic) — 429 delays, Lovable fallback, regex extraction
- [AI Enhance Batch](mem://features/editor/ai-enhance-batch-logic) — Parallel requests, processedKeysRef tracking
- [Formatting Preservation](mem://technical/translation-formatting-preservation) — \n placeholders, DP balanceLines algorithm
- [Line Splitting DP](mem://technical/line-splitting-algorithm) — `splitEvenlyByLines` to match English line count
- [BiDi Mixed Alignment](mem://technical/bidi-mixed-language-alignment) — LRI/PDI injection for LTR text in RTL paragraphs
- [Data Integrity Lock](mem://technical/import-data-integrity) — `importedKeys` prevents overwrite of external imports
- [Tech ID Protection](mem://technical/technical-identifier-protection) — Excluding 1-6 char alphanumerics from translation
- [Wilay Decoding Logic](mem://technical/wilay-decoding-logic) — Tegra X1 BC7 explicit dimension rendering
- [Wilay Encoding Logic](mem://technical/wilay-texture-replacement-logic) — Format matching, swizzling, rewrapWilayData
- [WIFNT Suite](mem://features/mod-packager/wifnt-suite) — BC1/BC4 font texture swizzling and baseline offset
- [DAT Processing Suite](mem://features/mod-packager/dat-processing-suite) — xbc1/zstd/zlib magic byte detection
- [Editor Hook Structure](mem://architecture/editor-hook-decomposition) — useEditorReview and useEditorCleanup decoupling
- [Cloud Sync Storage](mem://features/editor/bundled-translations-cloud-sync) — Supabase RLS public read, auth write
- [Editor Import Logic](mem://features/editor/import-management-logic) — Skips identical English imports if filter active
- [Translation Output Guard](mem://technical/translation-output-validation-logic) — Length ratio checks (<15% rejection)
- [Glossary Engine](mem://technical/glossary-engine-master) — Smart pre-filtering, greedy matching, ⟪T0⟫ placeholders
- [XC3 Dict Terminology](mem://style/terminology/xc3-master-dictionary) — Official XC3 localized terms
- [Game Theming](mem://style/game-specific-theming) — UI color schemes per game engine
