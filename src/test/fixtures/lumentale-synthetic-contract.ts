/**
 * Portable, invented LumenTale-shaped metadata for contract tests only.
 * It contains no UnityFS bytes, game strings, row identities, or user translations.
 */
import type { ExtractedEntry } from "@/components/editor/types";
import type { LumenTaleBundleMeta } from "@/lib/lumentale/lumentale-editor-bridge";

export const lumentaleSyntheticContract = {
  meta: {
    originalName: "synthetic-lumentale-contract.bundle",
    tables: [
      {
        asset: "Assets/Localization/Tables/Synthetic_en",
        table: "Synthetic_en",
        pathId: "synthetic-table-01",
        rowCount: 2,
        rows: [
          { editorKey: "lumentale/Synthetic_en:0", rowIndex: 0, m_Id: "synthetic-row-100" },
          { editorKey: "lumentale/Synthetic_en:1", rowIndex: 1, m_Id: "synthetic-row-101" },
        ],
      },
    ],
  } satisfies LumenTaleBundleMeta,
  entries: [
    {
      msbtFile: "lumentale/Synthetic_en",
      index: 0,
      label: "Synthetic_en · m_Id synthetic-row-100",
      original: "Use {player} to open <b>Menu</b>.",
      maxBytes: 1_000_000,
      risen3Cat: "lumentale-general",
    },
    {
      msbtFile: "lumentale/Synthetic_en",
      index: 1,
      label: "Synthetic_en · m_Id synthetic-row-101",
      original: "Coins: {0}",
      maxBytes: 1_000_000,
      risen3Cat: "lumentale-general",
    },
  ] satisfies ExtractedEntry[],
  validTranslations: {
    "lumentale/Synthetic_en:0": "استخدم {player} لفتح <b>القائمة</b>.",
    "lumentale/Synthetic_en:1": "العملات: {0}",
  },
} as const;
