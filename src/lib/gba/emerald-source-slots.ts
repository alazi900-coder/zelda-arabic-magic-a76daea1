/**
 * What the build's own sources say about its text, for the ROM built from them.
 *
 * The scanner has to recognise a line by its bytes, and two things it cannot
 * get right that way:
 *
 *   - Graphics and code contain runs the character set can draw, so a few
 *     thousand of them arrive looking like «fBl-l» or «STVYZ». They are not
 *     text, and machine-translating one writes Arabic over whatever those
 *     bytes really were.
 *   - A name in a fixed-size C field is followed by the zero bytes the
 *     compiler pads it with, and those belong to the field. Stopping at the
 *     terminator reported four bytes of room for «JYNX», whose slot holds ten.
 *
 * This build was made from sources we hold, so both answers are known exactly
 * rather than guessed: `scripts/gen_slots.py` reads them out and writes this
 * table. It is a list of offsets in one particular build, so it carries that
 * build's checksum and is ignored for any other file — a stale table would
 * silently hide real lines and hand out room that is not there.
 */

const SLOTS_URL = "/pokeemerald-slots.json";

/** Offset in the ROM -> how many bytes of text its slot really holds. */
export type EmeraldSourceSlots = Map<number, number>;

let cached: { sha: string; slots: EmeraldSourceSlots } | null = null;
let current: EmeraldSourceSlots | null = null;
let fetched: Promise<{ sha: string; slots: EmeraldSourceSlots } | null> | null = null;

async function sha256(rom: Uint8Array): Promise<string> {
  const copy = new Uint8Array(rom); // a view into a larger buffer digests wrong
  const hash = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function load() {
  if (!fetched) {
    fetched = (async () => {
      const res = await fetch(SLOTS_URL);
      if (!res.ok) return null;
      const json = (await res.json()) as { romSha256: string; slots: Record<string, number> };
      const slots: EmeraldSourceSlots = new Map();
      for (const [offset, room] of Object.entries(json.slots)) slots.set(Number(offset), room);
      return { sha: json.romSha256, slots };
    })().catch(() => null);
  }
  return fetched;
}

/**
 * Read the table and decide whether it belongs to this ROM.
 *
 * Call it before `extractPkmEntries` — the scan itself is synchronous, so this
 * is where the fetching and the checksum happen. When the ROM is a different
 * build the table is dropped and the scan falls back to reading the bytes,
 * which is what every other game does anyway.
 */
export async function ensureEmeraldSourceSlots(rom: Uint8Array): Promise<boolean> {
  cached = cached ?? (await load());
  current = cached && (await sha256(rom)) === cached.sha ? cached.slots : null;
  return current !== null;
}

/** The table for the ROM `ensureEmeraldSourceSlots` was last called with. */
export function emeraldSourceSlots(): EmeraldSourceSlots | null {
  return current;
}
