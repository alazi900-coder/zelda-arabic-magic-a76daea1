/**
 * Golden Sun: The Lost Age (AGFE) deep-diagnostic rules.
 *
 * Uses the same exact source-relative control-byte contract as the ROM
 * builder. Generic Xenoblade regex/RTL/newline rules are NOT valid for AGFE.
 */
import {
  goldenSun2TechnicalTokens,
  stripUnexpectedGoldenSun2RawControls,
  stripSurplusGoldenSun2ExplicitControls,
  validateGoldenSun2Translation,
} from "./goldensun2-editor-bridge";

const GAME_PREFIX = "goldensun/lost-age/";
const RAW_CONTROL_RE = /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g;
const DIRECTIONAL_RE = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function isGoldenSun2DiagnosticEntry(msbtFile: string): boolean {
  return msbtFile.startsWith(GAME_PREFIX);
}

export interface GoldenSun2Diagnostic {
  /** Unwanted characters can be removed with NO modifications to source tags. */
  unexpectedCount: number;
  unexpectedCodes: string[];
  validTokens: boolean;
  expectedTokens: string[];
  actualTokens: string[];
  /** Only non-structural characters or surplus controls are removed. */
  proposed: string;
  /** The proposed repair is safe against all source tokens. */
  safeToRepair: boolean;
}

const codePoint = (char: string): string =>
  "U+" + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");

export function diagnoseGoldenSun2Translation(source: string, translation: string): GoldenSun2Diagnostic {
  const cleanedRaw = stripUnexpectedGoldenSun2RawControls(source, translation);
  const cleanedExplicit = stripSurplusGoldenSun2ExplicitControls(source, cleanedRaw.text);
  const proposed = cleanedExplicit.text.replace(DIRECTIONAL_RE, "");
  const badRaw = [...translation.matchAll(RAW_CONTROL_RE)]
    .map(match => match[0]);
  const preservedRaw = [...cleanedRaw.text.matchAll(RAW_CONTROL_RE)]
    .map(match => match[0]);
  // Multiset subtraction: only report raw controls removed by the builder.
  const retained = new Map<string, number>();
  for (const char of preservedRaw) retained.set(char, (retained.get(char) || 0) + 1);
  const removedRaw: string[] = [];
  for (const char of badRaw) {
    const count = retained.get(char) || 0;
    if (count > 0) retained.set(char, count - 1);
    else removedRaw.push(char);
  }
  const removedExplicit: string[] = [];
  const a = [...cleanedRaw.text.matchAll(/\\x([0-9a-fA-F]{2})/g)].map(m => m[0]);
  const b = [...cleanedExplicit.text.matchAll(/\\x([0-9a-fA-F]{2})/g)].map(m => m[0].toUpperCase());
  for (const tag of a) {
    const canonical = tag.toUpperCase();
    const index = b.indexOf(canonical);
    if (index >= 0) b.splice(index, 1);
    else removedExplicit.push(canonical);
  }
  const directions = [...cleanedExplicit.text.matchAll(DIRECTIONAL_RE)].map(m => m[0]);
  const unexpectedCodes = [...new Set([
    ...removedRaw.map(codePoint),
    ...removedExplicit,
    ...directions.map(codePoint),
  ])];
  const expectedTokens = goldenSun2TechnicalTokens(source);
  const actualTokens = goldenSun2TechnicalTokens(translation);
  const unexpectedCount = cleanedRaw.removed + cleanedExplicit.removed + directions.length;
  return {
    unexpectedCount,
    unexpectedCodes,
    validTokens: validateGoldenSun2Translation(source, translation).valid,
    expectedTokens,
    actualTokens,
    proposed,
    safeToRepair: proposed !== translation && validateGoldenSun2Translation(source, proposed).valid,
  };
}
