/**
 * Platinum's character set, and the `{TAG}` syntax around it.
 *
 * The tables come from the game's own `charmap.txt` — the patched one, with
 * Arabic in the slots the English game never draws — so a letter the editor
 * writes is by construction a letter this ROM can draw. `scripts/gen_web_tables.py`
 * copies them out; they are not restated here.
 *
 * The decode and encode below follow msgenc's own grammar step for step,
 * because a translated line has to survive the round trip exactly: a `{STRVAR_1
 * 3, 0, 0}` is where the game drops a name or a number at runtime, and one
 * that comes back malformed is a name simply missing on screen with nothing to
 * say why.
 */

const CHARMAP_URL = "/pokeplatinum-charmap.json";
const ARCHIVES_URL = "/pokeplatinum-archives.json";

const FORMAT_ARG = 0xfffe;
const TRAINER_NAME = 0xf100;

export interface PlatCharmap {
  toChar: Map<number, string>;
  toCode: Map<string, number>;
  /** Longest multi-character charmap entry, so encoding knows how far to look. */
  maxCharLen: number;
  commandName: Map<number, string>;
  commandCode: Map<string, number>;
  strvarCodes: Set<number>;
}

let charmap: PlatCharmap | null = null;
let archives: string[] | null = null;
let loading: Promise<void> | null = null;

export async function ensurePlatTables(): Promise<void> {
  if (charmap && archives) return;
  if (!loading) {
    loading = (async () => {
      const [cmRes, arRes] = await Promise.all([fetch(CHARMAP_URL), fetch(ARCHIVES_URL)]);
      if (!cmRes.ok || !arRes.ok) throw new Error("تعذّر تحميل جداول Platinum");
      const raw = (await cmRes.json()) as {
        chars: Record<string, string>;
        commands: Record<string, string>;
        strvarCodes: number[];
      };
      const toChar = new Map<number, string>();
      const toCode = new Map<string, number>();
      let maxCharLen = 1;
      for (const [code, ch] of Object.entries(raw.chars)) {
        toChar.set(Number(code), ch);
        // First mapping wins: a couple of characters appear twice and the
        // earlier code is the one the English game actually uses.
        if (!toCode.has(ch)) toCode.set(ch, Number(code));
        maxCharLen = Math.max(maxCharLen, ch.length);
      }
      const commandName = new Map<number, string>();
      const commandCode = new Map<string, number>();
      for (const [code, name] of Object.entries(raw.commands)) {
        commandName.set(Number(code), name);
        commandCode.set(name, Number(code));
      }
      charmap = {
        toChar,
        toCode,
        maxCharLen,
        commandName,
        commandCode,
        strvarCodes: new Set(raw.strvarCodes),
      };
      archives = (await arRes.json()) as string[];
    })();
  }
  await loading;
}

export function platCharmap(): PlatCharmap {
  if (!charmap) throw new Error("جداول Platinum لم تُحمَّل");
  return charmap;
}

export function platArchiveName(index: number): string {
  return archives?.[index] ?? `archive_${index}`;
}

/** True when a message uses the packed trainer-name encoding, which is left alone. */
export function isPackedMessage(codes: number[]): boolean {
  return codes.includes(TRAINER_NAME);
}

export function decodePlatMessage(codes: number[]): string {
  const cm = platCharmap();
  let out = "";
  for (let j = 0; j < codes.length; j++) {
    const code = codes[j];
    const ch = cm.toChar.get(code);
    if (ch !== undefined) {
      out += ch;
      continue;
    }
    if (code !== FORMAT_ARG) {
      // Nothing else is expected, but a code with no name is still data the
      // game needs, so it round-trips as its own hex rather than being lost.
      out += `{${code.toString(16).toUpperCase().padStart(4, "0")}}`;
      continue;
    }
    const arg = codes[++j];
    const nargs = codes[++j];
    const isStrvar = cm.strvarCodes.has(arg & 0xff00);
    const name = isStrvar ? `STRVAR_${(arg >> 8).toString(16).toUpperCase()}` : cm.commandName.get(arg);
    const numbers: number[] = [];
    if (isStrvar) numbers.push(arg & 0xff);
    for (let k = 0; k < nargs; k++) numbers.push(codes[j + 1 + k]);
    j += nargs;
    out += name === undefined
      ? `{${arg.toString(16).toUpperCase().padStart(4, "0")}}`
      : `{${name}${numbers.length ? " " + numbers.join(", ") : ""}}`;
  }
  return out;
}

export class PlatEncodeError extends Error {}

export function encodePlatMessage(text: string): number[] {
  const cm = platCharmap();
  const out: number[] = [];
  for (let j = 0; j < text.length; j++) {
    if (text[j] === "{") {
      const close = text.indexOf("}", j);
      if (close < 0) throw new PlatEncodeError("وسم غير مغلق: ينقصه }");
      const body = text.slice(j + 1, close).trim();
      j = close;
      const space = body.indexOf(" ");
      const name = space < 0 ? body : body.slice(0, space);
      const numbers = space < 0
        ? []
        : body.slice(space + 1).split(",").map((n) => {
            const v = Number(n.trim());
            if (!Number.isInteger(v) || v < 0 || v > 0xffff) {
              throw new PlatEncodeError(`قيمة غير صالحة في الوسم {${body}}`);
            }
            return v;
          });

      let code = cm.commandCode.get(name);
      if (code === undefined && /^STRVAR_[0-9A-F]+$/i.test(name)) {
        code = parseInt(name.slice(7), 16) << 8;
      }
      if (code === undefined) {
        // The hex passthrough decode emits for an unnamed code.
        if (/^[0-9A-F]{4}$/i.test(name) && numbers.length === 0) {
          out.push(parseInt(name, 16));
          continue;
        }
        throw new PlatEncodeError(`وسم مجهول: {${name}}`);
      }
      const args = numbers.slice();
      if (name.startsWith("STRVAR_")) {
        if (args.length === 0) throw new PlatEncodeError(`الوسم {${name}} ينقصه رقمه الأول`);
        code |= args.shift()!;
      }
      out.push(FORMAT_ARG, code, args.length, ...args);
      continue;
    }

    // Longest match first: a few charmap entries are more than one character.
    let matched = false;
    for (let len = Math.min(cm.maxCharLen, text.length - j); len >= 1; len--) {
      const code = cm.toCode.get(text.substr(j, len));
      if (code !== undefined) {
        out.push(code);
        j += len - 1;
        matched = true;
        break;
      }
    }
    if (!matched) throw new PlatEncodeError(`حرف لا خانة له في الخط: «${text[j]}»`);
  }
  return out;
}

/** One character the font has no slot for, and how often the line asks for it. */
export interface PlatUnsupportedCharacter {
  character: string;
  /** `U+0651` — what to say about a character that has nothing to show. */
  unicode: string;
  count: number;
}

/**
 * Every character in a line that `encodePlatMessage` would refuse, not just the
 * first one.
 *
 * The encoder stops at the first, because writing a line half-encoded would put
 * a truncated sentence in the ROM. That is right for building and useless for
 * fixing: a translator who is told about one tashkeel mark fixes it, rebuilds,
 * and is told about the next. So the same walk runs here without throwing, and
 * collects them all.
 *
 * Tags are skipped exactly the way the encoder skips them — `{STRVAR_1 0}` is
 * a value the game substitutes, not eight characters to look up — and a
 * malformed tag is left to the build to report, since it is not a font problem.
 *
 * Returns nothing at all when the tables have not been fetched yet: this runs
 * on every keystroke in the editor, and a font table that is still loading is
 * not the same as a line with no problems, but it is the same on screen.
 */
export function analyzePlatUnsupportedCharacters(text: string): PlatUnsupportedCharacter[] {
  let cm: PlatCharmap;
  try {
    cm = platCharmap();
  } catch {
    return [];
  }

  const found = new Map<string, PlatUnsupportedCharacter>();
  for (let j = 0; j < text.length; j++) {
    if (text[j] === "{") {
      const close = text.indexOf("}", j);
      if (close < 0) break; // an unclosed tag is the build's to report, not ours
      j = close;
      continue;
    }

    let matched = false;
    for (let len = Math.min(cm.maxCharLen, text.length - j); len >= 1; len--) {
      if (cm.toCode.has(text.substr(j, len))) {
        j += len - 1;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const char = text[j];
    const unicode = `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
    const previous = found.get(unicode);
    found.set(unicode, previous ? { ...previous, count: previous.count + 1 } : { character: char, unicode, count: 1 });
  }

  return [...found.values()].sort((a, b) => b.count - a.count || a.unicode.localeCompare(b.unicode));
}
