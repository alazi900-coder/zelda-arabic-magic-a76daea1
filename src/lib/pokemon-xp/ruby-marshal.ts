/**
 * Pokémon XP import design: parse Ruby Marshal locally and never execute Ruby,
 * scripts, or data embedded in the game. The supported subset covers the
 * Array/Hash/String/UserData graph used by Pokémon Essentials message tables.
 */
export type RubyMarshalValue =
  | string
  | number
  | boolean
  | null
  | RubyMarshalValue[]
  | RubyMarshalHash
  | RubyMarshalObject
  | RubyMarshalUserData;

export interface RubyMarshalHash {
  kind: "hash";
  pairs: Array<[RubyMarshalValue, RubyMarshalValue]>;
  defaultValue?: RubyMarshalValue;
}

export interface RubyMarshalObject {
  kind: "object";
  className: string;
  ivars: Record<string, RubyMarshalValue>;
}

export interface RubyMarshalUserData {
  kind: "user-data";
  className: string;
  bytes: Uint8Array;
}

export class RubyMarshalParseError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} عند البايت 0x${offset.toString(16)}.`);
    this.name = "RubyMarshalParseError";
  }
}

class Reader {
  private readonly bytes: Uint8Array;
  private readonly decoder = new TextDecoder("utf-8", { fatal: false });
  private offset = 0;
  private readonly objects: RubyMarshalValue[] = [];
  private readonly symbols: string[] = [];

  constructor(input: ArrayBuffer | Uint8Array) {
    this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  }

  parse(): RubyMarshalValue {
    if (this.readByte() !== 4 || this.readByte() !== 8) {
      throw new RubyMarshalParseError("ليس الملف بصيغة Ruby Marshal 4.8", 0);
    }
    return this.readValue(0);
  }

  private readValue(depth: number): RubyMarshalValue {
    if (depth > 512) throw this.fail("تجاوز الملف عمق بنية آمن");
    const type = String.fromCharCode(this.readByte());
    switch (type) {
      case "0": return null;
      case "T": return true;
      case "F": return false;
      case "i": return this.readLong();
      case "l": return this.readBignum();
      case ":": return this.readSymbol();
      case ";": return this.readSymbolReference();
      case "@": return this.readObjectReference();
      case "\"": return this.readString();
      case "[": return this.readArray(depth + 1);
      case "{": return this.readHash(depth + 1, false);
      case "}": return this.readHash(depth + 1, true);
      case "I": return this.readIvar(depth + 1);
      case "o": return this.readObject(depth + 1);
      case "u": return this.readUserData();
      default: throw this.fail(`نوع Ruby Marshal غير مدعوم (${JSON.stringify(type)})`);
    }
  }

  private readByte(): number {
    if (this.offset >= this.bytes.length) throw this.fail("انتهى الملف قبل اكتمال البيانات");
    return this.bytes[this.offset++];
  }

  private readBytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      throw this.fail("طول بيانات غير صالح");
    }
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  /** Ruby Marshal's compact signed integer encoding. */
  private readLong(): number {
    const raw = this.readByte();
    const signed = raw >= 0x80 ? raw - 0x100 : raw;
    if (signed === 0) return 0;
    if (signed > 4) return signed - 5;
    if (signed < -4) return signed + 5;

    const count = Math.abs(signed);
    let result = 0;
    for (let index = 0; index < count; index++) result += this.readByte() * 2 ** (index * 8);
    return signed < 0 ? result - 2 ** (count * 8) : result;
  }

  private readBignum(): number {
    const sign = String.fromCharCode(this.readByte());
    const words = this.readLong();
    if (words < 0 || words > 4096) throw this.fail("حجم عدد كبير غير صالح");
    let result = 0;
    for (let index = 0; index < words; index++) {
      const low = this.readByte();
      const high = this.readByte();
      result += (low | (high << 8)) * 2 ** (index * 16);
    }
    return sign === "-" ? -result : result;
  }

  private readSymbol(): string {
    const text = this.decoder.decode(this.readBytes(this.readLong()));
    this.symbols.push(text);
    return text;
  }

  private readSymbolReference(): string {
    const value = this.symbols[this.readLong()];
    if (value === undefined) throw this.fail("مرجع رمز خارج حدود الملف");
    return value;
  }

  private readObjectReference(): RubyMarshalValue {
    const value = this.objects[this.readLong()];
    if (value === undefined) throw this.fail("مرجع كائن خارج حدود الملف");
    return value;
  }

  private track<T extends RubyMarshalValue>(value: T): T {
    this.objects.push(value);
    return value;
  }

  private readString(): string {
    const value = this.decoder.decode(this.readBytes(this.readLong()));
    return this.track(value);
  }

  private readArray(depth: number): RubyMarshalValue[] {
    const length = this.readLong();
    if (length < 0 || length > 2_000_000) throw this.fail("طول مصفوفة غير صالح");
    const array: RubyMarshalValue[] = this.track([]);
    for (let index = 0; index < length; index++) array.push(this.readValue(depth));
    return array;
  }

  private readHash(depth: number, withDefault: boolean): RubyMarshalHash {
    const length = this.readLong();
    if (length < 0 || length > 2_000_000) throw this.fail("طول جدول غير صالح");
    const hash = this.track({ kind: "hash", pairs: [] as Array<[RubyMarshalValue, RubyMarshalValue]> });
    for (let index = 0; index < length; index++) hash.pairs.push([this.readValue(depth), this.readValue(depth)]);
    if (withDefault) hash.defaultValue = this.readValue(depth);
    return hash;
  }

  private readIvar(depth: number): RubyMarshalValue {
    const value = this.readValue(depth);
    const count = this.readLong();
    if (count < 0 || count > 4096) throw this.fail("عدد خصائص غير صالح");
    for (let index = 0; index < count; index++) {
      this.readSymbolOrReference();
      this.readValue(depth);
    }
    return value;
  }

  private readSymbolOrReference(): string {
    const type = String.fromCharCode(this.readByte());
    if (type === ":") return this.readSymbol();
    if (type === ";") return this.readSymbolReference();
    throw this.fail("اسم خاصية Marshal ليس رمزاً");
  }

  private readObject(depth: number): RubyMarshalObject {
    const className = this.readSymbolOrReference();
    const count = this.readLong();
    if (count < 0 || count > 4096) throw this.fail("عدد خصائص كائن غير صالح");
    const object = this.track({ kind: "object", className, ivars: {} });
    for (let index = 0; index < count; index++) object.ivars[this.readSymbolOrReference()] = this.readValue(depth);
    return object;
  }

  private readUserData(): RubyMarshalUserData {
    const className = this.readSymbolOrReference();
    const value: RubyMarshalUserData = { kind: "user-data", className, bytes: this.readBytes(this.readLong()) };
    return this.track(value);
  }

  private fail(message: string): RubyMarshalParseError {
    return new RubyMarshalParseError(message, this.offset);
  }
}

export function parseRubyMarshal(input: ArrayBuffer | Uint8Array): RubyMarshalValue {
  return new Reader(input).parse();
}

export function isRubyMarshalHash(value: RubyMarshalValue): value is RubyMarshalHash {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value && value.kind === "hash";
}

export function isRubyMarshalUserData(value: RubyMarshalValue): value is RubyMarshalUserData {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value && value.kind === "user-data";
}
