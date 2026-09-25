typedef unsigned short u16;
typedef unsigned int u32;

extern u16 Data_32224[];

/* Extra halfwords each control code carries (same table validated earlier). */
static int RtlCodeArgs(unsigned int c) {
    if ((c >= 0x08 && c <= 0x0c) || c == 0x11 || c == 0x1d) return 1;
    if (c == 0x0e || c == 0x0f || c == 0x1c) return 2;
    return 0;
}
static int RtlIsLtr(unsigned int c) {
    return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}
static int RtlIsArabic(unsigned int c) {
    if (c >= 0x8c && c <= 0xff) return 1;
    return c == '<' || c == '>' || c == '@' || (c >= '[' && c <= '^') || c == '`' || (c >= '{' && c <= 0x7f);
}

/* Called after the original BufferString body has run (via the trampoline in
 * entry.s). r0 = the original's own return value ("start"), r1 = the text
 * buffer base the game just filled. Flips LTR runs (English words, numbers)
 * so mirroring at draw time puts them back in reading order. */
__attribute__((used))
int GsBufferStringPost(int start, u16 *buf) {
    int i = start, n;
    for (n = 0; n < 0x200 && buf[i] != 0; n++) {
        unsigned int c = buf[i];
        int j, last;
        if (c < 0x20) { i = (i + 1 + RtlCodeArgs(c)) & 0x1ff; continue; }
        if (!RtlIsLtr(c)) { i = (i + 1) & 0x1ff; continue; }
        last = i;
        for (j = i; buf[j] != 0; j = (j + 1) & 0x1ff) {
            c = buf[j];
            if (c < 0x20 || c > 0xff || RtlIsArabic(c)) break;
            if (RtlIsLtr(c)) last = j;
        }
        j = last;
        while (i != j) {
            u16 t = buf[i]; buf[i] = buf[j]; buf[j] = t;
            i = (i + 1) & 0x1ff;
            if (i == j) break;
            j = (j - 1) & 0x1ff;
        }
        i = (last + 1) & 0x1ff;
    }
    return start;
}

/* Called before the original DrawText body runs. r0=win r1=ch r2=x -- returns
 * the mirrored x. Same formula validated in the emulator earlier. */
__attribute__((used))
int GsDrawTextPreX(void *win, unsigned int ch, int x) {
    if (ch > 0x20 && ch <= 0xff) {
        int w = Data_32224[(ch - 0x20) * 16];
        int bound = *(unsigned short *)((unsigned char *)win + 8) * 8 - 12;
        x = bound - x - w;
        if (x < 0) x = 0;
    }
    return x;
}
