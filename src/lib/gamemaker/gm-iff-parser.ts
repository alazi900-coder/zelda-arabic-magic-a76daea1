/**
 * محلل ومُعيد بناء ملفات GameMaker IFF GEN8 (.droid, .win, .unx)
 * 
 * هيكل الملف:
 * - FORM (4 بايت) + الحجم الكلي (4 بايت)
 * - أقسام (Chunks) متعددة، كل قسم يبدأ بـ:
 *   - معرّف القسم (4 بايت، مثل "GEN8", "STRG", "CODE")
 *   - حجم القسم (4 بايت)
 *   - بيانات القسم
 * 
 * القسم المهم للترجمة: STRG (النصوص)
 * - عدد النصوص (4 بايت)
 * - مؤشرات النصوص (4 بايت لكل نص)
 * - بيانات النصوص (طول + محتوى لكل نص)
 */

import type { ExtractedEntry } from "@/components/editor/types";

export interface GameMakerString {
  offset: number;
  value: string;
}

export interface GameMakerIFFDocument {
  headerMagic: string; // "FORM"
  totalSize: number;
  chunks: Map<string, Uint8Array>;
  strings: GameMakerString[];
  originalBuffer: ArrayBuffer;
}

export interface GameMakerExtractResult {
  doc: GameMakerIFFDocument;
  entries: ExtractedEntry[];
  stats: {
    totalStrings: number;
    translatableStrings: number;
  };
}

// تصفية النصوص غير المهمة للترجمة
const SKIP_PATTERNS = [
  /^[0-9.]+$/, // أرقام فقط
  /^[{}()\[\]<>]+$/, // أقواس وعلامات فقط
  /^[a-zA-Z0-9_]*$/, // معرّفات برمجية فقط
  /^(true|false|null|undefined)$/, // قيم برمجية
  /^(scr_|spr_|obj_|rm_|fnt_)/, // معرّفات داخلية
];

function isTranslatable(text: string): boolean {
  if (!text || text.length === 0) return false;
  if (text.length > 500) return false; // نصوص طويلة جداً غالباً ما تكون بيانات
  
  // تخطي النصوص التي تطابق الأنماط المحظورة
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  
  // تخطي النصوص التي تحتوي على أحرف غير مطبوعة
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
      return false;
    }
  }
  
  return true;
}

/**
 * قراءة سلسلة نصية بصيغة UTF-8 من موضع محدد
 */
function readString(view: DataView, offset: number): { value: string; length: number } {
  const length = view.getUint32(offset, true);
  if (length === 0) return { value: "", length: 4 };
  
  const bytes = new Uint8Array(view.buffer, offset + 4, length);
  const value = new TextDecoder("utf-8").decode(bytes);
  return { value, length: 4 + length };
}

/**
 * كتابة سلسلة نصية بصيغة UTF-8 إلى موضع محدد
 */
function writeString(view: DataView, offset: number, text: string): number {
  const encoded = new TextEncoder().encode(text);
  view.setUint32(offset, encoded.length, true);
  const bytes = new Uint8Array(view.buffer, offset + 4, encoded.length);
  bytes.set(encoded);
  return 4 + encoded.length;
}

/**
 * محلل ملفات IFF GEN8
 */
export function parseGameMakerIFF(buffer: ArrayBuffer): GameMakerIFFDocument {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  let offset = 0;
  
  // قراءة رأس الملف
  const headerMagic = new TextDecoder("ascii").decode(bytes.subarray(0, 4));
  if (headerMagic !== "FORM") {
    throw new Error("ملف غير صحيح: التوقيع ليس FORM");
  }
  
  const totalSize = view.getUint32(4, true);
  offset = 8;
  
  // قراءة الأقسام
  const chunks = new Map<string, Uint8Array>();
  const strings: GameMakerString[] = [];
  
  while (offset < buffer.byteLength && offset < totalSize + 8) {
    if (offset + 8 > buffer.byteLength) break;
    
    const chunkId = new TextDecoder("ascii").decode(bytes.subarray(offset, offset + 4));
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkSize < 0 || offset + 8 + chunkSize > buffer.byteLength) break;
    
    const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkSize);
    chunks.set(chunkId, chunkData);
    
    offset += 8 + chunkSize;
  }
  
  // استخراج النصوص من قسم STRG
  if (chunks.has("STRG")) {
    const strgData = chunks.get("STRG")!;
    const strgView = new DataView(strgData.buffer, strgData.byteOffset, strgData.byteLength);
    
    const stringCount = strgView.getUint32(0, true);
    let stringOffset = 4 + stringCount * 4; // تخطي عدد النصوص والمؤشرات
    
    for (let i = 0; i < stringCount; i++) {
      const { value, length } = readString(strgView, stringOffset);
      strings.push({ offset: stringOffset, value });
      stringOffset += length;
    }
  }
  
  return {
    headerMagic,
    totalSize,
    chunks,
    strings,
    originalBuffer: buffer,
  };
}

/**
 * استخراج النصوص القابلة للترجمة من ملف GameMaker
 */
export function extractGameMakerEntries(doc: GameMakerIFFDocument): GameMakerExtractResult {
  const entries: ExtractedEntry[] = [];
  let translatableCount = 0;
  
  for (let i = 0; i < doc.strings.length; i++) {
    const str = doc.strings[i];
    
    if (!isTranslatable(str.value)) continue;
    
    translatableCount++;
    
    entries.push({
      msbtFile: "STRG", // جميع النصوص من قسم STRG
      index: i,
      label: str.value.length > 50 ? str.value.slice(0, 50) + "…" : str.value,
      original: str.value,
      maxBytes: 1024, // حد أقصى تقريبي
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
  // نسخ الملف الأصلي
  const originalBytes = new Uint8Array(doc.originalBuffer);
  const newBuffer = new ArrayBuffer(originalBytes.byteLength);
  const newBytes = new Uint8Array(newBuffer);
  newBytes.set(originalBytes);
  
  const newView = new DataView(newBuffer);
  
  // تطبيق الترجمات على النصوص
  let translatedCount = 0;
  
  for (let i = 0; i < doc.strings.length; i++) {
    const key = `STRG:${i}`;
    const translation = translations[key];
    
    if (translation && translation.trim()) {
      const stringOffset = doc.strings[i].offset;
      
      // حساب الحجم الجديد للنص
      const oldLength = newView.getUint32(stringOffset, true);
      const newLength = new TextEncoder().encode(translation).length;
      
      // إذا كان الحجم الجديد مختلفاً، قد نحتاج إلى إعادة ترتيب الملف بالكامل
      // للآن، نفترض أن الحجم الجديد لا يتجاوز الحد الأقصى
      if (newLength <= oldLength) {
        writeString(newView, stringOffset, translation);
        translatedCount++;
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
