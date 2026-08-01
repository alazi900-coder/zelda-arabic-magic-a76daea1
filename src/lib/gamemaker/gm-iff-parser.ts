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
  
  while (offset < buffer.byteLength && offset < totalSize + 8) {
    if (offset + 8 > buffer.byteLength) break;
    
    const chunkId = new TextDecoder("ascii").decode(bytes.subarray(offset, offset + 4));
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkSize < 0 || offset + 8 + chunkSize > buffer.byteLength) break;
    
    const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkSize);
    chunks.set(chunkId, new Uint8Array(chunkData)); // نسخ البيانات
    
    offset += 8 + chunkSize;
  }
  
  // استخراج النصوص من قسم STRG
  const strings: GameMakerString[] = [];
  
  if (chunks.has("STRG")) {
    const strgData = chunks.get("STRG")!;
    const strgView = new DataView(strgData.buffer, strgData.byteOffset, strgData.byteLength);
    
    try {
      const stringCount = strgView.getUint32(0, true);
      
      // قراءة جميع النصوص
      for (let i = 0; i < stringCount; i++) {
        try {
          // موضع المؤشر لهذا النص
          const pointerOffset = 4 + i * 4;
          if (pointerOffset + 4 > strgData.byteLength) break;
          
          const stringPointer = strgView.getUint32(pointerOffset, true);
          
          // قراءة النص من الموضع المشار إليه
          if (stringPointer + 4 > strgData.byteLength) continue;
          
          const stringLength = strgView.getUint32(stringPointer, true);
          
          if (stringLength < 0 || stringPointer + 4 + stringLength > strgData.byteLength) continue;
          
          // فك تشفير النص
          const stringBytes = strgData.subarray(stringPointer + 4, stringPointer + 4 + stringLength);
          const value = new TextDecoder("utf-8").decode(stringBytes);
          
          strings.push({
            offset: stringPointer,
            value,
            index: i,
          });
        } catch (e) {
          console.warn(`خطأ في قراءة النص ${i}:`, e);
          continue;
        }
      }
    } catch (e) {
      console.warn("خطأ في قراءة قسم STRG:", e);
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
  
  for (const str of doc.strings) {
    if (!isTranslatable(str.value)) continue;
    
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
  // نسخ الملف الأصلي
  const newBuffer = new ArrayBuffer(doc.originalBuffer.byteLength);
  const newBytes = new Uint8Array(newBuffer);
  newBytes.set(new Uint8Array(doc.originalBuffer));
  
  const newView = new DataView(newBuffer);
  
  // تطبيق الترجمات على النصوص
  let translatedCount = 0;
  
  for (const str of doc.strings) {
    const key = `STRG:${str.index}`;
    const translation = translations[key];
    
    if (translation && translation.trim()) {
      try {
        const encoded = new TextEncoder().encode(translation);
        const oldLength = newView.getUint32(str.offset, true);
        
        // تحديث الطول والنص فقط إذا كان الحجم الجديد لا يتجاوز الحد القديم
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
