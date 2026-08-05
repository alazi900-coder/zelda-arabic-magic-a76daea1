const STORAGE_KEY = "custom-game-covers";

type CoverMap = Record<string, string>;

export function readCovers(): CoverMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CoverMap) : {};
  } catch {
    return {};
  }
}

function writeCovers(map: CoverMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event("game-covers-changed"));
}

export function setCover(key: string, dataUrl: string) {
  const map = readCovers();
  map[key] = dataUrl;
  writeCovers(map);
}

export function clearCover(key: string) {
  const map = readCovers();
  delete map[key];
  writeCovers(map);
}

/** Resize an uploaded image to a card-sized JPEG data URL. */
export function fileToCoverDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 960;
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas غير مدعوم"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر قراءة الصورة"));
    };
    img.src = url;
  });
}
