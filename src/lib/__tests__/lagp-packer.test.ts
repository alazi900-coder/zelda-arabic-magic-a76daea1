import { describe, it, expect } from "vitest";
import { unpackLagp, repackLagp } from "@/lib/lagp-packer";

/**
 * Build a synthetic LAGP file (no outer compression) with a recognisable
 * payload so we can verify byte-exact round-trip.
 */
function makeFakeLagp(): ArrayBuffer {
  const HEADER = 32;
  const BODY = 256;
  const buf = new Uint8Array(HEADER + BODY);

  // LAGP magic
  buf[0] = 0x4c; buf[1] = 0x41; buf[2] = 0x47; buf[3] = 0x50;

  // Fill the rest of the "header" with a recognisable pattern.
  for (let i = 4; i < HEADER; i++) buf[i] = i;

  // Fill the body with another pattern.
  for (let i = 0; i < BODY; i++) buf[HEADER + i] = (i * 7 + 3) & 0xff;

  return buf.buffer;
}

function sha256(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) => {
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

describe("lagp-packer", () => {
  it("unpack → repack with no edits is byte-exact (no outer compression)", async () => {
    const original = makeFakeLagp();
    const originalHash = await sha256(new Uint8Array(original));

    const { zip, manifest } = await unpackLagp(original, "fake.wilay");

    expect(manifest.innerMagic).toBe("LAGP");
    expect(manifest.compressionSteps).toEqual([]);
    expect(manifest.xbc1HeaderBase64).toBeNull();
    expect(manifest.innerSize).toBe(32 + 256);
    expect(manifest.chunks.length).toBe(2);
    expect(manifest.chunks[0].kind).toBe("header");
    expect(manifest.chunks[1].kind).toBe("raw");

    const repacked = await repackLagp(zip);
    const repackedHash = await sha256(new Uint8Array(repacked));

    expect(repacked.byteLength).toBe(original.byteLength);
    expect(repackedHash).toBe(originalHash);
  });

  it("rejects non-LAGP files", async () => {
    const buf = new Uint8Array(64);
    buf[0] = 0x4c; buf[1] = 0x41; buf[2] = 0x48; buf[3] = 0x44; // LAHD
    await expect(unpackLagp(buf.buffer, "x.wilay")).rejects.toThrow(/Not a LAGP/);
  });

  it("repack reflects edits to the body chunk", async () => {
    const original = makeFakeLagp();
    const { zip } = await unpackLagp(original, "fake.wilay");

    // Load the ZIP, mutate body, repack manually via repackLagp.
    const JSZip = (await import("jszip")).default;
    const z = await JSZip.loadAsync(zip);
    const bodyName = "chunks/001_body.bin";
    const body = await z.file(bodyName)!.async("uint8array");
    body[0] = (body[0] + 1) & 0xff; // single-byte edit
    z.file(bodyName, body);
    const editedZip = await z.generateAsync({ type: "arraybuffer" });

    const repacked = await repackLagp(editedZip);
    const repackedBytes = new Uint8Array(repacked);
    const originalBytes = new Uint8Array(original);

    expect(repacked.byteLength).toBe(original.byteLength);
    // Header untouched
    for (let i = 0; i < 32; i++) expect(repackedBytes[i]).toBe(originalBytes[i]);
    // First body byte differs by exactly 1
    expect(repackedBytes[32]).toBe((originalBytes[32] + 1) & 0xff);
  });
});
