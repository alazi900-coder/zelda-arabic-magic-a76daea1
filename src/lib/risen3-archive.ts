/**
 * Writing a Risen 3 `.pak` back out, without losing what sits between the data
 * and the file tree.
 *
 * The Risen 2 builder in risen2-fontspak.ts lays the entries out, writes the
 * tree straight after them and stores `dataEnd - 0x20` as the offset — which
 * parses back correctly, because the reader adds 0x20 again. What it does not
 * do is keep the 32 bytes that sit there in the real file:
 *
 *     00 00 00 00 | 20 7e bb 85 48 9c d0 01 (x3) | 10 00 02 00
 *     a zero        three file times             the root folder's markers
 *
 * Those bytes are not padding — the stored offset points at them, and the
 * reader skips them by construction. Dropping them and shifting the offset back
 * by 32 leaves the engine reading the last 32 bytes of the last font's
 * compressed data where that block should be.
 *
 * It went unnoticed for four builds because every check asked whether the file
 * parsed, and it does. The check that catches it is stricter and simpler:
 * rebuilding an archive without changing anything must give back the same
 * bytes. That is what this module is for, and what its test asserts.
 *
 * The Risen 2 builder is left alone: its own tool works, and this is not the
 * place to find out otherwise.
 */

import { parseImagesPakHeader, type RisenPakHeader, type RisenPakNode } from "./risen-images-pak";
import { buildFontsPakArchive, type FontsPakBuildResult } from "./risen2-fontspak";

/** Bytes between the end of the data and the start of the tree. */
const PREAMBLE_SIZE = 0x20;

export interface Risen3ArchiveBuildResult extends FontsPakBuildResult {
  bytes: Uint8Array;
}

/**
 * Rebuilds the archive, keeping the block the reader skips.
 *
 * `replacements` is keyed by the path `flattenPakTree` gives, exactly as the
 * Risen 2 builder takes it.
 */
export function buildRisen3Archive(
  originalBytes: Uint8Array,
  header: RisenPakHeader,
  tree: RisenPakNode[],
  replacements: Map<string, Uint8Array> = new Map()
): Risen3ArchiveBuildResult {
  if (header.fileInfoOffset < PREAMBLE_SIZE) {
    throw new Error("الحاوية أصغر من أن تحمل ديباجة شجرة الملفات");
  }
  const preamble = originalBytes.slice(header.fileInfoOffset - PREAMBLE_SIZE, header.fileInfoOffset);

  const built = buildFontsPakArchive(originalBytes, header, tree, replacements);
  const builtHeader = parseImagesPakHeader(built.bytes.subarray(0, 48));
  // The Risen 2 builder puts the tree straight after the data; that is where
  // the block belongs instead.
  const dataEnd = builtHeader.fileInfoOffset;
  const treeBytes = built.bytes.subarray(dataEnd);

  const out = new Uint8Array(dataEnd + PREAMBLE_SIZE + treeBytes.length);
  out.set(built.bytes.subarray(0, dataEnd), 0);
  out.set(preamble, dataEnd);
  out.set(treeBytes, dataEnd + PREAMBLE_SIZE);

  const view = new DataView(out.buffer);
  // The stored offset names the block, and the reader adds 0x20 to reach the
  // tree — so it is the end of the data, not the start of the tree.
  view.setBigInt64(0x20, BigInt(dataEnd), true);
  view.setBigInt64(0x28, BigInt(out.length), true);

  return { ...built, bytes: out };
}
