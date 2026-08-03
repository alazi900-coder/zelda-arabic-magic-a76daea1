/**
 * محلل ومُعيد بناء ملفات GameMaker IFF GEN8 (.droid, .win, .unx)
 * 
 * يستخرج فقط النصوص المهمة للترجمة (الحوارات والرسائل والقوائم)
 * ويستبعد المعرّفات البرمجية والبيانات العشوائية
 */

import type { ExtractedEntry } from "@/components/editor/types";

export interface GameMakerString {
  offset: number;
  value: string;
  index: number;
}

export interface GameMakerIFFDocument {
  headerMagic: string;
  totalSize: number;
  chunks: Map<string, Uint8Array>;
  strings: GameMakerString[];
  originalBuffer: ArrayBuffer;
  strgChunkStart: number;
  /** فهارس النصوص التي تدفعها شيفرة اللعبة ثابتةً — هذه وحدها كلام اللاعب. */
  constantIndices: Set<number>;
  /** كم دالّة قُرئت، وكم منها لم تنتهِ عند طولها المذكور. */
  codeStats: { functions: number; misaligned: number };
}

export interface GameMakerExtractResult {
  doc: GameMakerIFFDocument;
  entries: ExtractedEntry[];
  stats: {
    totalStrings: number;
    translatableStrings: number;
  };
}

/**
 * أيّ النصوص نصٌّ يظهر للاعب — مقيسٌ من شيفرة اللعبة لا مُخمَّن
 *
 * قسم STRG يحمل كل نصّ في الملف: أسماء المتغيّرات والدوال والموارد
 * والمسارات، لا نصوص اللعبة وحدها. في لعبة Mario هذه ٩١٧٨ نصّاً، منها
 * ٣٣٥ فقط ما يراه اللاعب.
 *
 * وكانت القسمة قبل اليوم بقائمة كلمات مكتوبة باليد («mario», «castle»,
 * «felicidades»…): يقبل النصّ إن وافق كلمةً منها أو زاد طوله على ١٥.
 * فكانت تُخرج ٢٣٩ نصّاً — تُسقط منها ١٧٧ نصّاً حقيقياً لأنّه لم يوافق
 * كلمة، وتُدخل ٦٩ اسم ملفّ صوت لأنّه صادف واحدة. وهذا معنى «الاستخراج
 * العشوائي».
 *
 * والفصل الصحيح ليس في شكل النصّ بل في كيفيّة استعماله: مترجم GameMaker
 * يدفع كل نصّ ثابت في الشيفرة بأمر `push` من نوع «نصّ»، أمّا أسماء
 * المتغيّرات والدوال والموارد فتُذكر بفهارس في جداولها. فقراءة قسم CODE
 * تعطي بالضبط ما تستعمله اللعبة نصّاً — ٣٤٧ في هذا الملف — ولا شيء غيره.
 *
 * ويبقى منها ما تدفعه الشيفرة نصّاً وهو مرجع تقني لا كلام: اسم ملفّ حفظ
 * أو مكتبة أو مورد. تلك اثنتا عشرة، تُستبعد بقاعدتين مذكورتين أدناه.
 */

/** أوامر الدفع: push وpushLoc وpushGlb وpushBltn. */
const PUSH_OPCODES = new Set([0xc0, 0xc1, 0xc2, 0xc3]);
/** نوع المعامل «نصّ»: المعامل بعده فهرس في جدول STRG. */
const OPERAND_STRING = 6;

/** مراجع تقنية تدفعها الشيفرة نصّاً: أسماء ملفات وأسماء موارد. */
const TECHNICAL_PATTERNS = [
  /\.(dat|dll|ogg|wav|png|json|ini|txt|sav)$/i,
  /^(scr_|spr_|obj_|rm_|snd_|px_|fnt_|bg_|pt_|tl_|sh_)/,
];

function isTechnicalReference(text: string): boolean {
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * يمشي على شيفرة اللعبة ويجمع فهارس النصوص التي تدفعها ثابتةً.
 *
 * كل أمر أربعة بايتات، وبعضها يتبعه معامل بأربعة أو ثمانية. المشي يتوقّف
 * عند نهاية كل دالّة بالضبط، وهذا ما يُثبت أنّ قراءة الأطوال صحيحة:
 * على ملفّ اللعبة مشت الدوالّ الأربع آلاف وخمسمئة وخمس وستّون كلّها إلى
 * نهايتها بلا انحراف واحد.
 */
function collectStringConstants(
  view: DataView,
  codeChunkStart: number,
  stringCount: number
): { indices: Set<number>; functions: number; misaligned: number } {
  const indices = new Set<number>();
  const count = view.getUint32(codeChunkStart, true);
  let misaligned = 0;

  for (let i = 0; i < count; i++) {
    const entry = view.getUint32(codeChunkStart + 4 + 4 * i, true);
    if (entry + 20 > view.byteLength) { misaligned++; continue; }
    const length = view.getUint32(entry + 4, true);
    const start = entry + 12 + view.getInt32(entry + 12, true);
    const end = start + length;
    if (start < 0 || end > view.byteLength) { misaligned++; continue; }

    let p = start;
    while (p + 4 <= end) {
      const word = view.getUint32(p, true);
      const opcode = (word >>> 24) & 0xff;
      const operandType = (word >>> 16) & 0x0f;
      p += 4;

      if (PUSH_OPCODES.has(opcode)) {
        if (operandType === 0 || operandType === 3) {
          p += 8; // double أو int64
        } else if (operandType === 15) {
          // int16 — قيمته داخل الأمر نفسه
        } else {
          if (operandType === OPERAND_STRING && p + 4 <= end) {
            const index = view.getUint32(p, true);
            if (index < stringCount) indices.add(index);
          }
          p += 4;
        }
      } else if (opcode === 0x84) {
        // pushi — قيمته داخل الأمر
      } else if (opcode === 0x45) {
        if (operandType !== 15) p += 4; // pop، إلا صيغة التبديل
      } else if (opcode === 0xd9) {
        p += 4; // call
      } else if (opcode === 0xff) {
        if (operandType === 2) p += 4; // break الممتدّ
      }
    }
    if (p !== end) misaligned++;
  }

  return { indices, functions: count, misaligned };
}

/**
 * محلل ملفات IFF GEN8
 */
export function parseGameMakerIFF(buffer: ArrayBuffer): GameMakerIFFDocument {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  // قراءة رأس الملف
  const headerMagic = new TextDecoder("ascii").decode(bytes.subarray(0, 4));
  if (headerMagic !== "FORM") {
    throw new Error("ملف غير صحيح: التوقيع ليس FORM");
  }
  
  const totalSize = view.getUint32(4, true);
  let offset = 8;
  
  // قراءة الأقسام
  const chunks = new Map<string, Uint8Array>();
  let strgChunkStart = 0;
  let codeChunkStart = 0;

  while (offset < buffer.byteLength && offset < totalSize + 8) {
    if (offset + 8 > buffer.byteLength) break;
    
    const chunkId = new TextDecoder("ascii").decode(bytes.subarray(offset, offset + 4));
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkSize < 0 || offset + 8 + chunkSize > buffer.byteLength) break;
    
    const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkSize);
    chunks.set(chunkId, new Uint8Array(chunkData));
    
    if (chunkId === "STRG") {
      strgChunkStart = offset + 8;
    }
    if (chunkId === "CODE") {
      // العناوين داخل هذا القسم مطلقة في الملف، فيُقرأ من المخزن الأصلي
      // لا من نسخة القسم.
      codeChunkStart = offset + 8;
    }

    offset += 8 + chunkSize;
  }
  
  // استخراج النصوص من قسم STRG
  const strings: GameMakerString[] = [];
  
  if (chunks.has("STRG")) {
    const strgData = chunks.get("STRG")!;
    
    try {
      const strgView = new DataView(strgData.buffer, strgData.byteOffset, strgData.byteLength);
      const stringCount = strgView.getUint32(0, true);
      
      for (let i = 0; i < stringCount; i++) {
        try {
          const pointerOffset = 4 + i * 4;
          if (pointerOffset + 4 > strgData.byteLength) break;
          
          const absolutePointer = strgView.getUint32(pointerOffset, true);
          const relativePointer = absolutePointer - strgChunkStart;
          
          if (relativePointer < 0 || relativePointer + 4 > strgData.byteLength) continue;
          
          const stringLength = strgView.getUint32(relativePointer, true);
          
          if (stringLength < 0 || relativePointer + 4 + stringLength > strgData.byteLength) continue;
          
          const stringBytes = strgData.subarray(relativePointer + 4, relativePointer + 4 + stringLength);
          const value = new TextDecoder("utf-8").decode(stringBytes);
          
          strings.push({
            offset: absolutePointer,
            value,
            index: i,
          });
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      console.warn("خطأ في قراءة قسم STRG:", e);
    }
  }
  
  // ما تدفعه شيفرة اللعبة نصّاً ثابتاً — وهذا وحده كلام اللاعب.
  const code = codeChunkStart > 0
    ? collectStringConstants(view, codeChunkStart, strings.length)
    : { indices: new Set<number>(), functions: 0, misaligned: 0 };

  return {
    headerMagic,
    totalSize,
    chunks,
    strings,
    originalBuffer: buffer,
    strgChunkStart,
    constantIndices: code.indices,
    codeStats: { functions: code.functions, misaligned: code.misaligned },
  };
}

/**
 * استخراج النصوص القابلة للترجمة من ملف GameMaker
 */
export function extractGameMakerEntries(doc: GameMakerIFFDocument): GameMakerExtractResult {
  const entries: ExtractedEntry[] = [];
  let translatableCount = 0;

  if (doc.constantIndices.size === 0) {
    // بلا شيفرة مقروءة لا يبقى إلا التخمين، وهو ما كان يُخرج نصوصاً عشوائية.
    throw new Error(
      `تعذّر قراءة شيفرة اللعبة (قسم CODE)، فلا أعرف أيّ النصوص كلامٌ يظهر للاعب` +
      ` — قُرئت ${doc.codeStats.functions} دالّة، انحرفت منها ${doc.codeStats.misaligned}`
    );
  }

  for (const str of doc.strings) {
    if (!doc.constantIndices.has(str.index)) continue;
    if (!str.value || isTechnicalReference(str.value)) continue;

    translatableCount++;
    
    entries.push({
      msbtFile: "STRG",
      index: str.index,
      label: str.value.length > 60 ? str.value.slice(0, 60) + "…" : str.value,
      original: str.value,
      maxBytes: 1024,
    });
  }
  
  return {
    doc,
    entries,
    stats: {
      totalStrings: doc.strings.length,
      translatableStrings: translatableCount,
    },
  };
}

/**
 * إعادة بناء ملف GameMaker مع التطبيق الترجمات
 */
export function buildGameMakerIFF(
  doc: GameMakerIFFDocument,
  translations: Record<string, string>
): { buffer: ArrayBuffer; translatedCount: number } {
  const newBuffer = new ArrayBuffer(doc.originalBuffer.byteLength);
  const newBytes = new Uint8Array(newBuffer);
  newBytes.set(new Uint8Array(doc.originalBuffer));
  
  const newView = new DataView(newBuffer);
  
  let translatedCount = 0;
  
  for (const str of doc.strings) {
    const key = `STRG:${str.index}`;
    const translation = translations[key];
    
    if (translation && translation.trim()) {
      try {
        const encoded = new TextEncoder().encode(translation);
        const oldLength = newView.getUint32(str.offset, true);
        
        if (encoded.length <= oldLength) {
          newView.setUint32(str.offset, encoded.length, true);
          const targetBytes = new Uint8Array(newBuffer, str.offset + 4, encoded.length);
          targetBytes.set(encoded);
          translatedCount++;
        }
      } catch (e) {
        console.warn(`خطأ في تطبيق ترجمة النص ${str.index}:`, e);
      }
    }
  }
  
  return {
    buffer: newBuffer,
    translatedCount,
  };
}

/**
 * استخراج جميع النصوص (للتصحيح والفحص)
 */
export function extractAllStrings(doc: GameMakerIFFDocument): string[] {
  return doc.strings.map(s => s.value);
}
