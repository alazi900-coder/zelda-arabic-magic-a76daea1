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
}

export interface GameMakerExtractResult {
  doc: GameMakerIFFDocument;
  entries: ExtractedEntry[];
  stats: {
    totalStrings: number;
    translatableStrings: number;
  };
}

// كلمات مفتاحية تشير إلى نصوص مهمة للترجمة
const IMPORTANT_KEYWORDS = [
  // كلمات إنجليزية شائعة
  'the', 'you', 'your', 'hello', 'welcome', 'please', 'press', 'game', 'level', 'world',
  'stage', 'congratulations', 'game over', 'thanks', 'made', 'by', 'engine', 'edition', 'demo',
  'mario', 'enemy', 'power', 'jump', 'run', 'block', 'coin', 'fire', 'water', 'ice',
  'castle', 'walljump', 'hug', 'wall', 'throwable', 'bricks', 'grab', 'key', 'switch',
  'palace', 'dig', 'chest', 'cheat', 'code', 'warning', 'enter', 'menu', 'select',
  'start', 'continue', 'quit', 'save', 'load', 'delete', 'new', 'game',
  // كلمات إسبانية شائعة
  'felicidades', 'ganando', 'holaa', 'bienvenido', 'jugando', 'menú', 'escojiendo',
  'principal', 'mapa', 'mundo', 'poder', 'casa', 'toad', 'power-up',
];

// أنماط يجب تخطيها
const SKIP_PATTERNS = [
  /^[0-9.]+$/, // أرقام فقط
  /^[{}()\[\]<>]+$/, // أقواس وعلامات فقط
  /^[a-zA-Z_][a-zA-Z0-9_]*$/, // معرّفات برمجية (متغير واحد)
  /^(true|false|null|undefined)$/, // قيم برمجية
  /^(scr_|spr_|obj_|rm_|fnt_|ds_|gml_|px_|vk_)/, // معرّفات داخلية
  /^@@/, // معرّفات خاصة
  /^\$\$/, // معرّفات خاصة
  /^(prototype|arguments|instance_exists|keyboard_check|draw_self)$/, // دوال شهيرة
  /^(numpad|caps|lock|page|print|screen|windows|scroll)/, // مفاتيح لوحة المفاتيح
  /^(0|1|2|3|4|5|6|7|8|9)$/, // أرقام مفردة
  /^(FPS:|settings\.dat|discord_rich_presence\.dll|0123456789)$/, // ملفات وإعدادات
];

function isTranslatable(text: string): boolean {
  if (!text || text.length === 0) return false;
  if (text.length > 500) return false;
  
  // تخطي النصوص التي تطابق الأنماط المحظورة
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  
  // تخطي النصوص التي تحتوي على أحرف غير مطبوعة (باستثناء الحركات)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // السماح بـ: حروف، أرقام، مسافات، علامات ترقيم، حركات عربية
    if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
      return false;
    }
  }
  
  // يجب أن يحتوي على كلمات حقيقية (حروف متعددة)
  const hasLetters = /[a-zA-Z]/.test(text);
  const hasWords = /\b[a-zA-Z]{2,}\b/.test(text);
  
  if (!hasLetters && !hasWords) return false;
  
  // البحث عن كلمات مفتاحية مهمة
  const lowerText = text.toLowerCase();
  const hasImportantKeyword = IMPORTANT_KEYWORDS.some(keyword => lowerText.includes(keyword));
  
  // النصوص التي تحتوي على كلمات مفتاحية مهمة أو طول معقول مع كلمات
  return hasImportantKeyword || (text.length > 15 && hasWords);
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
  
  return {
    headerMagic,
    totalSize,
    chunks,
    strings,
    originalBuffer: buffer,
    strgChunkStart,
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
