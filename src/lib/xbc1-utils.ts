import { autoDecompressZstd } from "@/lib/zstd-utils";

export interface UnwrappedWilaySource {
  data: ArrayBuffer;
  outerMagic: string;
  innerMagic: string;
  steps: string[];
  archiveName: string;
  changed: boolean;
}

function getMagicString(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 4) return "????";
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function decompressDeflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const result = await Promise.race([
      (async () => {
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(toArrayBuffer(bytes)).catch(() => {});
        writer.close().catch(() => {});

        const chunks: Uint8Array[] = [];
        let totalLen = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          totalLen += value.length;
        }

        if (totalLen === 0) return null;

        const out = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.length;
        }
        return out;
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return result;
  } catch {
    return null;
  }
}

async function parseXbc1Payload(buffer: ArrayBuffer): Promise<{ data: ArrayBuffer; archiveName: string } | null> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 48 || getMagicString(bytes) !== "xbc1") return null;

  const view = new DataView(buffer);
  const compressionType = view.getUint32(4, true);
  const compressedSize = view.getUint32(12, true);
  let archiveName = "";

  for (let i = 20; i < Math.min(48, bytes.length); i++) {
    if (bytes[i] === 0) break;
    archiveName += String.fromCharCode(bytes[i]);
  }

  const payloadEnd = compressedSize > 0 ? Math.min(bytes.length, 48 + compressedSize) : bytes.length;
  const payload = bytes.slice(48, payloadEnd);
  if (payload.length === 0) return null;

  if (compressionType === 0) {
    return { data: toArrayBuffer(payload), archiveName };
  }

  if (compressionType === 1) {
    const inflated = await decompressDeflate(payload);
    return inflated ? { data: toArrayBuffer(inflated), archiveName } : null;
  }

  if (compressionType === 3) {
    const { data, wasCompressed } = await autoDecompressZstd(toArrayBuffer(payload));
    return wasCompressed ? { data, archiveName } : null;
  }

  return null;
}

const WILAY_MAGICS = ["LAHD", "LAGP", "LAPS"];

export async function unwrapWilaySource(
  buffer: ArrayBuffer,
  depth = 3,
  steps: string[] = [],
  outerMagic?: string,
  archiveName = "",
): Promise<UnwrappedWilaySource> {
  const bytes = new Uint8Array(buffer);
  const currentMagic = getMagicString(bytes);
  const firstMagic = outerMagic ?? currentMagic;

  // If the current data is already a recognized WILAY format, stop unwrapping
  if (depth <= 0 || bytes.length < 4 || WILAY_MAGICS.includes(currentMagic)) {
    return {
      data: buffer,
      outerMagic: firstMagic,
      innerMagic: currentMagic,
      steps,
      archiveName,
      changed: steps.length > 0,
    };
  }

  if (currentMagic === "xbc1") {
    const parsed = await parseXbc1Payload(buffer);
    if (parsed) {
      return unwrapWilaySource(parsed.data, depth - 1, [...steps, "xbc1"], firstMagic, parsed.archiveName || archiveName);
    }
  }

  const zstd = await autoDecompressZstd(buffer);
  if (zstd.wasCompressed) {
    return unwrapWilaySource(zstd.data, depth - 1, [...steps, "zstd"], firstMagic, archiveName);
  }

  const inflated = await decompressDeflate(bytes);
  if (inflated && inflated.length > bytes.length) {
    return unwrapWilaySource(toArrayBuffer(inflated), depth - 1, [...steps, "deflate"], firstMagic, archiveName);
  }

  return {
    data: buffer,
    outerMagic: firstMagic,
    innerMagic: currentMagic,
    steps,
    archiveName,
    changed: steps.length > 0,
  };
}
