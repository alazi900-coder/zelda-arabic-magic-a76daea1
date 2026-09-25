/**
 * Golden Sun's text compression: a Huffman code whose tree depends on the
 * PREVIOUS byte (256 separate trees, one per possible previous character),
 * ported byte-for-byte from the decomp's `tools/unpack_strings.c` (decode)
 * and `tools/pack_strings.c` (encode) so this module can read and rewrite
 * the ROM's own string table without any C toolchain.
 *
 * Tree format, as the ROM stores it and `serializeTrees` reproduces:
 *  - a leaf array, 12-bit character codes packed two per three bytes,
 *    addressed BACKWARDS from where the topology bitstream starts
 *    (`leafId + (leafId>>1)` bytes before it -- odd/even leaves share a
 *    byte through its two nibbles);
 *  - a topology bitstream, depth-first: `0` descends into two children,
 *    `1` is a leaf (consumes the next leaf id in order).
 * `offsets[prevChar]` is that character's tree's byte offset from the
 * trees blob's start; `0x8000` means "no tree" (prevChar never occurred
 * before another character in any string).
 *
 * All positions below are absolute byte offsets into one shared buffer
 * (the ROM for decoding, a freshly built blob for encoding), matching the
 * C source's raw pointer arithmetic without needing negative-offset views.
 */

class BitReader {
  private bits = 0;
  private avail = 0;
  constructor(private buf: Uint8Array, private pos: number) {}
  next(): number {
    if (this.avail === 0) {
      this.bits = this.buf[this.pos++];
      this.avail = 8;
    }
    const bit = this.bits & 1;
    this.bits >>= 1;
    this.avail--;
    return bit;
  }
}

class BitWriter {
  bytes: number[] = [];
  private bits = 0;
  private pending = 0;
  append(bit: number) {
    this.bits |= bit << this.pending;
    this.pending++;
    if (this.pending === 8) {
      this.bytes.push(this.bits);
      this.bits = 0;
      this.pending = 0;
    }
  }
  get bitsWritten() {
    return this.bytes.length * 8 + this.pending;
  }
  flush() {
    if (this.pending) {
      this.bytes.push(this.bits);
      this.bits = 0;
      this.pending = 0;
    }
  }
}

function countSubtreeLeaves(tree: BitReader): number {
  let leaves = 0;
  let level = 0;
  let guard = 0;
  do {
    if (tree.next()) {
      leaves++;
      level--;
    } else {
      level++;
    }
    if (++guard > 100000) throw new Error("goldensun-huffman: tree topology never terminated (malformed tree)");
  } while (level >= 0);
  return leaves;
}

/** Unpacks the leaf array's backwards, nibble-packed 12-bit codes (serializeLeaf's inverse). */
function getCharValue(data: Uint8Array, treeTopologyAddr: number, leafId: number): number {
  const offset = leafId + (leafId >> 1);
  const b0 = data[treeTopologyAddr - offset - 1];
  const b1 = data[treeTopologyAddr - offset - 2];
  return leafId & 1 ? ((b0 & 0x0f) << 8) | b1 : (b0 << 4) | (b1 >> 4);
}

function decompressChar(
  reader: BitReader,
  prevChr: number,
  data: Uint8Array,
  treesAddr: number,
  offsetsAddr: number
): number {
  const offset = data[offsetsAddr + prevChr * 2] | (data[offsetsAddr + prevChr * 2 + 1] << 8);
  if (offset === 0x8000) throw new Error(`goldensun-huffman: no tree for previous byte 0x${prevChr.toString(16)}`);
  const treeTopologyAddr = treesAddr + offset;
  const treeReader = new BitReader(data, treeTopologyAddr);
  let leafId = 0;
  let guard = 0;
  while (treeReader.next() === 0) {
    if (reader.next()) leafId += countSubtreeLeaves(treeReader);
    if (++guard > 100000) throw new Error("goldensun-huffman: tree walk never reached a leaf (malformed tree)");
  }
  return getCharValue(data, treeTopologyAddr, leafId);
}

/**
 * Decodes one NUL-terminated string starting at `addr`. Returns the bytes
 * (without the trailing 0). How many compressed bytes this consumed is
 * given by the ROM's own per-string length table -- see goldensun-rom.ts,
 * which advances by that instead of trying to recover it here.
 */
export function decompressString(data: Uint8Array, addr: number, treesAddr: number, offsetsAddr: number): number[] {
  const reader = new BitReader(data, addr);
  const out: number[] = [];
  let c = 0;
  let guard = 0;
  do {
    c = decompressChar(reader, c, data, treesAddr, offsetsAddr);
    if (c !== 0) out.push(c);
    if (++guard > 2000) throw new Error("goldensun-huffman: string decode ran away (no terminator)");
  } while (c !== 0);
  return out;
}

// ---------------------------------------------------------------------------
// Encoding: build fresh per-context trees over a full corpus and compress
// every string against them, mirroring pack_strings.c exactly.
// ---------------------------------------------------------------------------

interface HuffNode {
  chr: number; // -1 for an internal node
  freq: number;
  pos: number; // first occurrence in the corpus -- keeps ties deterministic
  parent: HuffNode | null;
  children: [HuffNode, HuffNode] | null;
}

function isLeaf(n: HuffNode) {
  return n.chr !== -1;
}

/** Same ordering as pack_strings.c's `sorted`: lowest frequency first, leaves before internal nodes on a tie, then first occurrence. */
function sortedBefore(a: HuffNode, b: HuffNode): boolean {
  if (a.freq !== b.freq) return a.freq < b.freq;
  if (isLeaf(a) !== isLeaf(b)) return isLeaf(a);
  return a.pos <= b.pos;
}

function buildOneTree(corpus: Uint8Array, targetPrev: number): { root: HuffNode | null; nleaves: number } {
  const nodes: HuffNode[] = [];
  for (let i = 0; i < 256; i++) nodes.push({ chr: i, freq: 0, pos: 0, parent: null, children: null });
  let prev = 0;
  for (let i = 0; i < corpus.length; i++) {
    const c = corpus[i];
    if (prev === targetPrev) {
      const node = nodes[c];
      if (node.freq === 0) node.pos = i;
      node.freq++;
    }
    prev = c;
  }
  const queue: HuffNode[] = [];
  const push = (node: HuffNode) => {
    let pos = 0;
    while (pos < queue.length && sortedBefore(queue[pos], node)) pos++;
    queue.splice(pos, 0, node);
  };
  const pop = (): HuffNode => queue.shift()!;
  let nleaves = 0;
  for (const n of nodes) if (n.freq) { push(n); nleaves++; }
  let nextId = 1000000; // only used for `pos` uniqueness of internal nodes, never compared to leaves' real corpus positions in a way that matters (leaves always sort before internal nodes on a freq tie regardless)
  while (queue.length > 1) {
    const child1 = pop();
    const child2 = pop();
    const parent: HuffNode = { chr: -1, freq: child1.freq + child2.freq, pos: nextId++, parent: null, children: [child1, child2] };
    child1.parent = parent;
    child2.parent = parent;
    push(parent);
  }
  return { root: queue.length ? queue[0] : null, nleaves };
}

interface SerializedTree {
  leafArray: number[];
  topology: number[];
  topologyBits: number;
}

function serializeTree(root: HuffNode | null, nleaves: number): SerializedTree {
  const leafArrayLen = nleaves + (nleaves >> 1) + (nleaves & 1);
  const leafArray = new Array(leafArrayLen).fill(0);
  let nextLeafId = 0;
  const writer = new BitWriter();
  const serializeLeaf = (chr: number) => {
    const id = nextLeafId++;
    const offset = id + (id >> 1);
    const ptr = leafArrayLen - offset;
    if (id & 1) {
      leafArray[ptr - 2] = chr;
    } else {
      leafArray[ptr - 1] = chr >> 4;
      leafArray[ptr - 2] |= (chr & 0x0f) << 4;
    }
  };
  const serializeSubtree = (node: HuffNode) => {
    if (isLeaf(node)) {
      writer.append(1);
      serializeLeaf(node.chr);
    } else {
      writer.append(0);
      serializeSubtree(node.children![0]);
      serializeSubtree(node.children![1]);
    }
  };
  if (root) serializeSubtree(root);
  writer.flush();
  return { leafArray, topology: writer.bytes, topologyBits: writer.bitsWritten };
}

export interface BuiltTrees {
  /** Concatenated leaf-array + topology bytes for every tree that has leaves, back to back. */
  treesBlob: Uint8Array;
  /** One u16 per possible previous byte (0-255): offset into treesBlob, or 0x8000 if unused. */
  offsets: Uint16Array;
  /** Per-context node table, needed by compressChar to find a leaf's bit path. */
  trees: Map<number, { root: HuffNode | null; leaves: Map<number, HuffNode> }>;
}

/** Builds all 256 context trees over `corpus` (the concatenation of every string's bytes, each ending in a 0x00). */
export function buildTrees(corpus: Uint8Array): BuiltTrees {
  const offsets = new Uint16Array(256).fill(0x8000);
  const blobParts: number[] = [];
  const trees: BuiltTrees["trees"] = new Map();
  let ntrees = 0;
  for (let i = 0; i < 256; i++) {
    const { root, nleaves } = buildOneTree(corpus, i);
    const leaves = new Map<number, HuffNode>();
    const collect = (n: HuffNode | null) => {
      if (!n) return;
      if (isLeaf(n)) leaves.set(n.chr, n);
      else { collect(n.children![0]); collect(n.children![1]); }
    };
    collect(root);
    trees.set(i, { root, leaves });
    if (nleaves === 0) continue;
    ntrees = i + 1;
    const ser = serializeTree(root, nleaves);
    // Matches write_trees(): the leaf array is written FIRST, and the
    // offset records where the TOPOLOGY starts (right after it) -- that is
    // the address get_huffman_tree hands to get_char_value/count_subtree.
    blobParts.push(...ser.leafArray);
    offsets[i] = blobParts.length;
    blobParts.push(...ser.topology);
  }
  if (ntrees > 256) throw new Error("goldensun-huffman: more than 256 contexts (impossible)");
  return { treesBlob: new Uint8Array(blobParts), offsets, trees };
}

/** Compresses one NUL-terminated string (bytes, WITHOUT the trailing 0 -- it is added here) against `built`. */
export function compressString(built: BuiltTrees, bytes: number[]): Uint8Array {
  const writer = new BitWriter();
  let prev = 0;
  const seq = [...bytes, 0];
  for (const next of seq) {
    const ctx = built.trees.get(prev);
    if (!ctx) throw new Error(`goldensun-huffman: no tree table for previous byte 0x${prev.toString(16)}`);
    const leaf = ctx.leaves.get(next);
    if (!leaf) throw new Error(`goldensun-huffman: byte 0x${next.toString(16)} never followed 0x${prev.toString(16)} in the corpus`);
    const path: number[] = [];
    let node: HuffNode = leaf;
    while (node.parent) {
      path.push(node.parent.children![1] === node ? 1 : 0);
      node = node.parent;
    }
    for (let i = path.length - 1; i >= 0; i--) writer.append(path[i]);
    prev = next;
  }
  writer.flush();
  return new Uint8Array(writer.bytes);
}
