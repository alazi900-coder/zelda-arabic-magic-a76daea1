/** ضغط LZ77 بأبسط صورة صالحة: كل بايت يُخزَّن كما هو. للاختبار وحده. */
export function compressGbaLz77Store(data: Uint8Array): Uint8Array {
  const blocks = Math.ceil(data.length / 8);
  const out = new Uint8Array(4 + blocks * 9);
  out[0] = 0x10;
  out[1] = data.length & 0xff;
  out[2] = (data.length >> 8) & 0xff;
  out[3] = (data.length >> 16) & 0xff;
  let p = 4;
  for (let b = 0; b < blocks; b++) {
    out[p++] = 0; // ثمانية عناصر، كلّها بايتات صريحة
    for (let i = 0; i < 8; i++) out[p++] = data[b * 8 + i] ?? 0;
  }
  return out;
}
