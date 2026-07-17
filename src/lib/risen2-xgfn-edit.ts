/**
 * Safe manual-edit operations on a parsed `.xgfn` document. Every operation
 * clones the document, applies the change, then passes the result through
 * `verifyDocumentSafe` (rebuild → reparse → full audit) — an edit that would
 * corrupt the font throws and leaves the caller's document untouched.
 *
 * Deletion policy: deleting a character removes its charmap PAIR only; its
 * measurement record stays in place. Removing records would renumber every
 * later glyph index (high corruption risk for zero benefit) — original
 * fonts themselves contain records with no pair pointing at them, so an
 * orphan record is a normal, safe state. The one exception guarded here:
 * if the deleted pair pointed at the LAST record and nothing else points at
 * it, recordCount is intentionally still left unchanged — the engine
 * tolerates orphan tail records on originals' evidence, and shrinking the
 * table would break the recordCount==maxGlyphIndex+1 equation only in the
 * other (dangerous) direction.
 */
import type { XgfnDocument, XgfnGlyphRecord, XgfnMeasurement } from "./risen2-xgfn";
import { verifyDocumentSafe, type XgfnAuditReport } from "./risen2-xgfn-audit";

export interface EditResult {
  doc: XgfnDocument;
  report: XgfnAuditReport;
}

function cloneDoc(doc: XgfnDocument): XgfnDocument {
  return {
    headerPrefix: doc.headerPrefix.slice(),
    glyphCount: doc.glyphCount,
    charmap: doc.charmap.map((p) => ({ ...p })),
    recordCount: doc.recordCount,
    measurements: doc.measurements.map((m) => {
      const rawBytes = m.rawBytes.slice();
      return { rawBytes, fields: [...m.fields] };
    }),
    trailingBytes: doc.trailingBytes.slice(),
    ddsBytes: doc.ddsBytes, // atlas pixels never change in these ops — share
  };
}

function patchPairCount(doc: XgfnDocument): void {
  const view = new DataView(doc.headerPrefix.buffer, doc.headerPrefix.byteOffset, doc.headerPrefix.byteLength);
  view.setUint32(0xf6, doc.charmap.length, true);
  // 0x1C = totalSize - 0x66; totalSize shifts by ±4 per added/removed pair.
  const measurementsTotalLen = doc.measurements.reduce((s, m) => s + m.rawBytes.length, 0);
  const totalSize = doc.headerPrefix.length + doc.charmap.length * 4 + 4 + measurementsTotalLen + doc.trailingBytes.length + doc.ddsBytes.length;
  view.setUint32(0x1c, totalSize - 0x66, true);
}

function makeRecord(fields: number[]): XgfnMeasurement {
  if (fields.length !== 9) throw new Error("سجل القياسات يجب أن يحوي 9 حقول بالضبط");
  const rawBytes = new Uint8Array(36);
  const dv = new DataView(rawBytes.buffer);
  fields.forEach((v, i) => dv.setInt32(i * 4, v, true));
  return { rawBytes, fields: [...fields] };
}

/** Overwrite all 9 int32 fields of one measurement record. `original` (the
 * pre-edit-session document) is deliberately NOT passed to the safety gate's
 * original-comparison here — editing an existing record is the whole point —
 * but every structural rule still applies. */
export function updateGlyphFields(doc: XgfnDocument, glyphIndex: number, fields: number[]): EditResult {
  if (glyphIndex < 0 || glyphIndex >= doc.measurements.length) {
    throw new Error(`مؤشر حرف غير صالح: ${glyphIndex}`);
  }
  const next = cloneDoc(doc);
  next.measurements[glyphIndex] = makeRecord(fields);
  return verifyDocumentSafe(next);
}

/** Remove the charmap pair for `charCode` (the glyph's record stays — see
 * module docblock for why). */
export function deleteCharmapPair(doc: XgfnDocument, charCode: number): EditResult {
  const idx = doc.charmap.findIndex((p) => p.charCode === charCode);
  if (idx < 0) throw new Error(`لا يوجد زوج للرمز U+${charCode.toString(16).toUpperCase()}`);
  const next = cloneDoc(doc);
  next.charmap.splice(idx, 1);
  patchPairCount(next);
  return verifyDocumentSafe(next);
}

/** Map a (new) charCode to an EXISTING glyph — smart aliasing: the new
 * character instantly renders with a proven-working glyph, no atlas change.
 * Refuses to shadow an existing mapping (delete it first). */
export function addCharmapAlias(doc: XgfnDocument, charCode: number, glyphIndex: number): EditResult {
  if (doc.charmap.some((p) => p.charCode === charCode)) {
    throw new Error(`الرمز U+${charCode.toString(16).toUpperCase()} مربوط مسبقاً — احذف ربطه أولاً`);
  }
  if (glyphIndex < 0 || glyphIndex >= doc.recordCount) {
    throw new Error(`مؤشر حرف غير صالح: ${glyphIndex} (السجلات: ${doc.recordCount})`);
  }
  const next = cloneDoc(doc);
  next.charmap.push({ charCode, glyphIndex });
  patchPairCount(next);
  return verifyDocumentSafe(next);
}

/** Re-point an existing charCode at a different existing glyph. */
export function remapCharmapPair(doc: XgfnDocument, charCode: number, newGlyphIndex: number): EditResult {
  const pair = doc.charmap.find((p) => p.charCode === charCode);
  if (!pair) throw new Error(`لا يوجد زوج للرمز U+${charCode.toString(16).toUpperCase()}`);
  if (newGlyphIndex < 0 || newGlyphIndex >= doc.recordCount) {
    throw new Error(`مؤشر حرف غير صالح: ${newGlyphIndex} (السجلات: ${doc.recordCount})`);
  }
  const next = cloneDoc(doc);
  next.charmap.find((p) => p.charCode === charCode)!.glyphIndex = newGlyphIndex;
  return verifyDocumentSafe(next);
}

export type { XgfnGlyphRecord };
