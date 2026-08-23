export default function getMode(reader) {
    let modeByte = reader.read(0, 8)

    if (modeByte === 0) return 8

    for (let i = 0; i < 8; i++) {
        if ((modeByte >> i) & 1) return i
    }
    return 8
}
