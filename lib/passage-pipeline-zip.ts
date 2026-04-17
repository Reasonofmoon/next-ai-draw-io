/**
 * Minimal ZIP writer (store-only, no compression, no external deps).
 *
 * Good enough for bundling a few dozen PNGs + a text URL list.
 * For production-grade ZIP, swap for fflate or JSZip.
 */

let crc32Table: Uint32Array | null = null
function crc32(data: Uint8Array): number {
    if (!crc32Table) {
        const t = new Uint32Array(256)
        for (let i = 0; i < 256; i++) {
            let c = i
            for (let k = 0; k < 8; k++)
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
            t[i] = c >>> 0
        }
        crc32Table = t
    }
    let c = 0xffffffff
    for (let i = 0; i < data.length; i++)
        c = (c >>> 8) ^ crc32Table[(c ^ data[i]) & 0xff]
    return (c ^ 0xffffffff) >>> 0
}

function dosTime(d: Date): { date: number; time: number } {
    const date =
        ((d.getFullYear() - 1980) << 9) |
        ((d.getMonth() + 1) << 5) |
        d.getDate()
    const time =
        (d.getHours() << 11) |
        (d.getMinutes() << 5) |
        Math.floor(d.getSeconds() / 2)
    return { date, time }
}

export function makeZip(
    files: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
    const now = new Date()
    const { date, time } = dosTime(now)
    const encoder = new TextEncoder()

    const localParts: Uint8Array[] = []
    const centralParts: Uint8Array[] = []
    let offset = 0

    for (const file of files) {
        const nameBytes = encoder.encode(file.name)
        const crc = crc32(file.data)
        const size = file.data.length

        // Local file header (30 bytes + name)
        const local = new ArrayBuffer(30 + nameBytes.length)
        const lv = new DataView(local)
        lv.setUint32(0, 0x04034b50, true)
        lv.setUint16(4, 20, true) // version
        lv.setUint16(6, 0, true) // flags
        lv.setUint16(8, 0, true) // method (store)
        lv.setUint16(10, time, true)
        lv.setUint16(12, date, true)
        lv.setUint32(14, crc, true)
        lv.setUint32(18, size, true)
        lv.setUint32(22, size, true)
        lv.setUint16(26, nameBytes.length, true)
        lv.setUint16(28, 0, true)
        new Uint8Array(local, 30).set(nameBytes)
        localParts.push(new Uint8Array(local), file.data)

        // Central directory entry (46 bytes + name)
        const central = new ArrayBuffer(46 + nameBytes.length)
        const cv = new DataView(central)
        cv.setUint32(0, 0x02014b50, true)
        cv.setUint16(4, 20, true)
        cv.setUint16(6, 20, true)
        cv.setUint16(8, 0, true)
        cv.setUint16(10, 0, true)
        cv.setUint16(12, time, true)
        cv.setUint16(14, date, true)
        cv.setUint32(16, crc, true)
        cv.setUint32(20, size, true)
        cv.setUint32(24, size, true)
        cv.setUint16(28, nameBytes.length, true)
        cv.setUint16(30, 0, true)
        cv.setUint16(32, 0, true)
        cv.setUint16(34, 0, true)
        cv.setUint16(36, 0, true)
        cv.setUint32(38, 0, true)
        cv.setUint32(42, offset, true)
        new Uint8Array(central, 46).set(nameBytes)
        centralParts.push(new Uint8Array(central))

        offset += 30 + nameBytes.length + size
    }

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0)
    const centralOffset = offset

    // End of central directory (22 bytes)
    const eocd = new ArrayBuffer(22)
    const ev = new DataView(eocd)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(4, 0, true)
    ev.setUint16(6, 0, true)
    ev.setUint16(8, files.length, true)
    ev.setUint16(10, files.length, true)
    ev.setUint32(12, centralSize, true)
    ev.setUint32(16, centralOffset, true)
    ev.setUint16(20, 0, true)

    const totalSize =
        localParts.reduce((s, p) => s + p.length, 0) + centralSize + 22
    const out = new Uint8Array(totalSize)
    let pos = 0
    for (const p of localParts) {
        out.set(p, pos)
        pos += p.length
    }
    for (const p of centralParts) {
        out.set(p, pos)
        pos += p.length
    }
    out.set(new Uint8Array(eocd), pos)
    return out
}
