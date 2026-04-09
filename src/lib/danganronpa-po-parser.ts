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