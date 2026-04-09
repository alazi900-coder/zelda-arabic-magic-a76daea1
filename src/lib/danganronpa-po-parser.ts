export interface PoEntry {
  original: string;
  translation: string;
  context?: string;
}

interface WorkingPoEntry {
  msgctxt: string;
  msgid: string;
  msgstr: string;
}

type PoField = keyof WorkingPoEntry | null;

function createEntry(): WorkingPoEntry {
  return {
    msgctxt: "",
    msgid: "",
    msgstr: "",
  };
}

function decodePoCandidate(buffer: ArrayBuffer): string {
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buffer));
  const normalized = decoded
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/g, "\n");

  const firstMarker = [normalized.indexOf("msgctxt \""), normalized.indexOf("msgid \"")]
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];

  return firstMarker != null ? normalized.slice(firstMarker) : normalized;
}

function decodeQuotedPoString(rawQuoted: string): string {
  try {
    return JSON.parse(rawQuoted) as string;
  } catch {
    return rawQuoted
      .replace(/^"/, "")
      .replace(/"$/, "")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function encodePoString(str: string): string {
  return '"' + str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
  + '"';
}

function pushEntry(entries: PoEntry[], current: WorkingPoEntry) {
  if (!current.msgid.trim()) return;

  entries.push({
    original: current.msgid,
    translation: current.msgstr,
    context: current.msgctxt.trim() || undefined,
  });
}

export function parsePo(buffer: ArrayBuffer): PoEntry[] {
  const text = decodePoCandidate(buffer);

  if (!text.includes('msgid "') && !text.includes('msgctxt "')) {
    return [];
  }

  const lines = text.split("\n");
  const entries: PoEntry[] = [];
  let current = createEntry();
  let currentField: PoField = null;
  let seenPoSyntax = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (current.msgctxt || current.msgid || current.msgstr) {
        pushEntry(entries, current);
        current = createEntry();
        currentField = null;
      }
      continue;
    }

    if (line.startsWith("#")) {
      continue;
    }

    const markerMatch = line.match(/(?:^|[^\w])(msgctxt|msgid|msgid_plural|msgstr(?:\[\d+\])?)\s+(".*")$/);
    if (markerMatch) {
      seenPoSyntax = true;

      const rawField = markerMatch[1];
      const value = decodeQuotedPoString(markerMatch[2]);
      const field: Exclude<PoField, null> = rawField.startsWith("msgstr")
        ? "msgstr"
        : rawField === "msgctxt"
          ? "msgctxt"
          : "msgid";

      if (field === "msgid" && (current.msgid || current.msgstr)) {
        pushEntry(entries, current);
        current = createEntry();
      }

      if (field === "msgstr" && current.msgstr) {
        current.msgstr += value;
      } else {
        current[field] = value;
      }

      currentField = field;
      continue;
    }

    const continuationMatch = line.match(/^(".*")$/);
    if (continuationMatch && currentField) {
      current[currentField] += decodeQuotedPoString(continuationMatch[1]);
    }
  }

  if (current.msgctxt || current.msgid || current.msgstr) {
    pushEntry(entries, current);
  }

  return seenPoSyntax ? entries : [];
}

/**
 * Build a .po file buffer from entries, preserving original structure.
 * If originalBuffer is provided, we patch msgstr values in-place.
 * Otherwise we build a fresh .po file.
 */
export function buildPo(entries: PoEntry[], originalBuffer?: ArrayBuffer): ArrayBuffer {
  if (originalBuffer) {
    return patchPoBuffer(entries, originalBuffer);
  }
  return buildFreshPo(entries);
}

function buildFreshPo(entries: PoEntry[]): ArrayBuffer {
  const lines: string[] = [];
  for (const entry of entries) {
    if (entry.context) {
      lines.push(`msgctxt ${encodePoString(entry.context)}`);
    }
    lines.push(`msgid ${encodePoString(entry.original)}`);
    lines.push(`msgstr ${encodePoString(entry.translation || "")}`);
    lines.push("");
  }
  return new TextEncoder().encode(lines.join("\n")).buffer as ArrayBuffer;
}

/**
 * Patch an existing .po buffer: replace msgstr values with translations
 * while keeping comments, ordering, and formatting intact.
 */
function patchPoBuffer(entries: PoEntry[], originalBuffer: ArrayBuffer): ArrayBuffer {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(originalBuffer));
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  // Build a lookup: msgid -> translation
  const translationMap = new Map<string, string>();
  for (const entry of entries) {
    const key = entry.context ? `${entry.context}\x00${entry.original}` : entry.original;
    if (entry.translation) {
      translationMap.set(key, entry.translation);
    }
  }

  const output: string[] = [];
  let currentCtxt = "";
  let currentMsgid = "";
  let currentField: "msgctxt" | "msgid" | "msgstr" | null = null;
  let inMsgstr = false;
  let msgstrLineStart = -1;

  function flushMsgstr() {
    if (!inMsgstr || msgstrLineStart < 0) return;
    const key = currentCtxt ? `${currentCtxt}\x00${currentMsgid}` : currentMsgid;
    const translation = translationMap.get(key);
    if (translation !== undefined) {
      // Remove old msgstr lines and replace
      while (output.length > msgstrLineStart) output.pop();
      output.push(`msgstr ${encodePoString(translation)}`);
    }
    inMsgstr = false;
    msgstrLineStart = -1;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushMsgstr();
      currentCtxt = "";
      currentMsgid = "";
      currentField = null;
      output.push(rawLine);
      continue;
    }

    if (line.startsWith("#")) {
      flushMsgstr();
      currentField = null;
      output.push(rawLine);
      continue;
    }

    const markerMatch = line.match(/^(msgctxt|msgid|msgid_plural|msgstr(?:\[\d+\])?)\s+(".*")$/);
    if (markerMatch) {
      const rawField = markerMatch[1];
      const value = decodeQuotedPoString(markerMatch[2]);

      if (rawField === "msgctxt") {
        flushMsgstr();
        currentCtxt = value;
        currentField = "msgctxt";
        output.push(rawLine);
      } else if (rawField === "msgid") {
        flushMsgstr();
        currentMsgid = value;
        currentField = "msgid";
        output.push(rawLine);
      } else if (rawField.startsWith("msgstr")) {
        flushMsgstr();
        inMsgstr = true;
        msgstrLineStart = output.length;
        currentField = "msgstr";
        output.push(rawLine);
      } else {
        output.push(rawLine);
      }
      continue;
    }

    const continuationMatch = line.match(/^(".*")$/);
    if (continuationMatch && currentField) {
      const value = decodeQuotedPoString(continuationMatch[1]);
      if (currentField === "msgctxt") currentCtxt += value;
      else if (currentField === "msgid") currentMsgid += value;
      output.push(rawLine);
      continue;
    }

    output.push(rawLine);
  }

  flushMsgstr();

  return new TextEncoder().encode(output.join("\n")).buffer as ArrayBuffer;
}
