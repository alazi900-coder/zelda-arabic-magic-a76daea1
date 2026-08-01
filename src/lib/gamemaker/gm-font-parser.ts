/**
 * محلل خطوط GameMaker
 * يستخرج معلومات الخطوط من قسم FONT والصور من قسم TXTR
 */

export interface FontCharacter {
  char: string;
  charCode: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shift: number;
  offset: number;
}

export interface GameMakerFont {
  name: string;
  size: number;
  bold: boolean;
  italic: boolean;
  charset: number;
  antiAlias: number;
  characters: FontCharacter[];
  texturePageId: number;
}

export interface TexturePage {
  id: number;
  width: number;
  height: number;
  data: Uint8Array;
  format: string; // "RGBA", "RGB", etc.
}

export interface GameMakerFontData {
  fonts: GameMakerFont[];
  texturePages: TexturePage[];
}

/**
 * استخراج معلومات الخطوط من ملف GameMaker
 */
export function extractFontsFromGameMaker(
  fontChunk: Uint8Array | undefined,
  txtrChunk: Uint8Array | undefined
): GameMakerFontData {
  const fonts: GameMakerFont[] = [];
  const texturePages: TexturePage[] = [];

  // محاولة قراءة الخطوط من FONT chunk
  if (fontChunk && fontChunk.length > 0) {
    try {
      const view = new DataView(fontChunk.buffer, fontChunk.byteOffset, fontChunk.byteLength);
      const fontCount = view.getUint32(0, true);

      let offset = 4;
      for (let i = 0; i < fontCount && offset < fontChunk.length; i++) {
        try {
          // قراءة معلومات الخط الأساسية
          const nameLen = view.getUint32(offset, true);
          offset += 4;

          if (offset + nameLen > fontChunk.length) break;

          const nameBytes = fontChunk.subarray(offset, offset + nameLen);
          const name = new TextDecoder("utf-8").decode(nameBytes);
          offset += nameLen;

          // قراءة خصائص الخط
          if (offset + 20 > fontChunk.length) break;

          const size = view.getUint32(offset, true);
          offset += 4;
          const bold = view.getUint8(offset) !== 0;
          offset += 1;
          const italic = view.getUint8(offset) !== 0;
          offset += 1;
          const charset = view.getUint32(offset, true);
          offset += 4;
          const antiAlias = view.getUint32(offset, true);
          offset += 4;
          const texturePageId = view.getUint32(offset, true);
          offset += 4;

          const font: GameMakerFont = {
            name,
            size,
            bold,
            italic,
            charset,
            antiAlias,
            characters: [],
            texturePageId,
          };

          fonts.push(font);
        } catch (e) {
          console.warn(`خطأ في قراءة الخط ${i}:`, e);
          continue;
        }
      }
    } catch (e) {
      console.warn("خطأ في قراءة قسم FONT:", e);
    }
  }

  // محاولة قراءة صفحات الصور من TXTR chunk
  if (txtrChunk && txtrChunk.length > 0) {
    try {
      const view = new DataView(txtrChunk.buffer, txtrChunk.byteOffset, txtrChunk.byteLength);
      const pageCount = view.getUint32(0, true);

      let offset = 4;
      for (let i = 0; i < pageCount && offset < txtrChunk.length; i++) {
        try {
          // قراءة معلومات صفحة الصورة
          if (offset + 12 > txtrChunk.length) break;

          const width = view.getUint32(offset, true);
          offset += 4;
          const height = view.getUint32(offset, true);
          offset += 4;
          const dataSize = view.getUint32(offset, true);
          offset += 4;

          if (offset + dataSize > txtrChunk.length) break;

          const data = txtrChunk.subarray(offset, offset + dataSize);
          offset += dataSize;

          const texturePage: TexturePage = {
            id: i,
            width,
            height,
            data: new Uint8Array(data),
            format: "RGBA",
          };

          texturePages.push(texturePage);
        } catch (e) {
          console.warn(`خطأ في قراءة صفحة الصورة ${i}:`, e);
          continue;
        }
      }
    } catch (e) {
      console.warn("خطأ في قراءة قسم TXTR:", e);
    }
  }

  return { fonts, texturePages };
}

/**
 * تحويل بيانات الصورة إلى ImageData للعرض على Canvas
 */
export function texturePageToImageData(
  page: TexturePage
): ImageData | null {
  try {
    const imageData = new ImageData(page.width, page.height);
    const data = imageData.data;

    // نسخ بيانات الصورة
    for (let i = 0; i < page.data.length && i < data.length; i++) {
      data[i] = page.data[i];
    }

    return imageData;
  } catch (e) {
    console.warn("خطأ في تحويل صفحة الصورة:", e);
    return null;
  }
}

/**
 * رسم حرف عربي على Canvas بحجم محدد
 */
export function drawArabicCharacter(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  size: number,
  color: string = "#000000"
): void {
  try {
    ctx.font = `${size}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, x, y);
  } catch (e) {
    console.warn(`خطأ في رسم الحرف "${char}":`, e);
  }
}

/**
 * الحروف العربية الأساسية المستخدمة في الألعاب
 */
export const ARABIC_CHARACTERS = [
  // الحروف الأساسية
  "ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي",
  // الأرقام العربية
  "٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩",
  // علامات الترقيم
  ".", ",", "؛", ":", "؟", "!", "\"", "'", "-", "/", "\\", "(", ")", "[", "]", "{", "}",
  // مسافة
  " ",
];

/**
 * الحروف العربية مع الحركات
 */
export const ARABIC_CHARACTERS_WITH_DIACRITICS = [
  ...ARABIC_CHARACTERS,
  // الحركات
  "َ", "ً", "ُ", "ٌ", "ِ", "ٍ", "ّ", "ْ",
];
