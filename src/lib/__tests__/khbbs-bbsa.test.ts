import { describe, expect, it } from "vitest";
import { indexKHBbsDatFiles, verifyKHBbsCtdEntries } from "../khbbs-bbsa";

function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint16(offset, value, true);
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}

function makeSyntheticBbs0(): File {
  const bytes = new Uint8Array(0x2000);
  bytes.set(new TextEncoder().encode("bbsa"), 0);
  writeU32(bytes, 4, 1);
  writeU16(bytes, 8, 1);
  writeU16(bytes, 10, 0);
  writeU16(bytes, 12, 2);
  writeU16(bytes, 14, 2);
  writeU32(bytes, 16, 0x100);
  writeU32(bytes, 20, 0x80);
  writeU16(bytes, 26, 1);
  writeU32(bytes, 32, 10);
  writeU32(bytes, 36, 20);
  writeU32(bytes, 40, 30);
  writeU32(bytes, 44, 40);

  // المجموعة 0 يُفترض أنها ARC في جدول ثابت، لكنها تحمل SEDB (SCD) فعلياً.
  writeU32(bytes, 0x80, 0x11111111);
  writeU32(bytes, 0x84, (1 << 12) | 1);
  writeU32(bytes, 0x88, 0x00435445);
  bytes.set(new TextEncoder().encode("SEDB"), 0x1000);

  // المجموعة 1 يُفترض أنها BIN في جدول ثابت، لكنها تحمل @CTD فعلياً.
  writeU32(bytes, 0x8c, 0x22222222);
  writeU32(bytes, 0x90, (2 << 12) | 1);
  writeU32(bytes, 0x94, 0x00435445);
  bytes.set(new TextEncoder().encode("@CTD"), 0x1800);

  // لا تعتمد بيئة Vitest هنا على File المتصفح كاملاً؛ نوفّر الجزء الذي يستعمله
  // قارئ BBS (الاسم والحجم وslice().arrayBuffer()) بصورة صريحة.
  return {
    name: "BBS0.DAT",
    size: bytes.byteLength,
    slice(start = 0, end = bytes.byteLength) {
      const segment = bytes.slice(start, end);
      return { arrayBuffer: async () => segment.buffer };
    },
  } as unknown as File;
}

describe("KHBBS CTD directory detection", () => {
  it("يعرض ملف @CTD من الترويسة الفعلية ولا يعرض SCD التي يحمل جدولها امتداداً خاطئاً", async () => {
    const index = await indexKHBbsDatFiles([makeSyntheticBbs0()]);

    const ctdEntries = index.entries.filter((entry) => entry.extension === "ctd");
    expect(ctdEntries).toHaveLength(1);
    expect(ctdEntries[0]).toMatchObject({ fileHash: 0x22222222, catalogExtension: "bin" });
    expect(index.entries.find((entry) => entry.fileHash === 0x11111111)).toMatchObject({ extension: "scd" });
  });

  it("يتحقق من CTD المختارة فقط ولا يقرأ موارد SCD", async () => {
    const index = await indexKHBbsDatFiles([makeSyntheticBbs0()]);
    const visibleCtd = index.entries.filter((entry) => entry.extension === "ctd");

    const result = await verifyKHBbsCtdEntries(visibleCtd, index.archives);
    expect(result).toEqual({ checked: 1, confirmed: 1, mismatch: 0 });
    expect(visibleCtd[0]).toMatchObject({ isVerifiedCtd: true, ctdVerification: "confirmed" });
    expect(index.entries.find((entry) => entry.fileHash === 0x11111111)?.ctdVerification).toBe("not-applicable");
  });
});
