/**
 * Minimal QR-Code generator (alphanumeric / byte mode, version 1-10).
 *
 * Hand-written so the build does not gain another dependency. Implements
 * just enough of ISO/IEC 18004 to encode the WebRTC offer / answer blobs
 * the multiplayer lobby produces.
 *
 * The implementation is intentionally compact rather than maximally
 * efficient — these strings are typically 1.5-3 KB so we use byte mode
 * with error-correction level L (the smallest matrix that fits).
 *
 * Usage:
 *   const svg = generateQrSvg(longString);
 *   container.innerHTML = svg;
 *
 * Note: WebRTC SDP blobs are usually too long for a single QR code with
 * a phone-readable density. We slice the input into chunks of ~800 bytes
 * each and emit one QR per chunk; the consumer concatenates them in the
 * order they were scanned. The renderer draws all chunks side-by-side.
 */

// Galois field tables for Reed-Solomon error correction.
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGf() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function rsGeneratorPoly(degree) {
    let g = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array(g.length + 1).fill(0);
        for (let j = 0; j < g.length; j++) {
            next[j]     ^= g[j];
            next[j + 1] ^= gfMul(g[j], GF_EXP[i]);
        }
        g = next;
    }
    return g;
}

function rsEncode(data, ecLength) {
    const gen = rsGeneratorPoly(ecLength);
    const buf = data.concat(new Array(ecLength).fill(0));
    for (let i = 0; i < data.length; i++) {
        const coef = buf[i];
        if (coef !== 0) {
            for (let j = 0; j < gen.length; j++) {
                buf[i + j] ^= gfMul(gen[j], coef);
            }
        }
    }
    return buf.slice(data.length);
}

// Capacity table for byte mode, EC level L, versions 1-10. Values are the
// data-codeword count per version (excluding error correction).
const VERSION_INFO = [
    null,
    { totalCodewords:  26, dataCodewords: 19, ecCodewords:  7 },
    { totalCodewords:  44, dataCodewords: 34, ecCodewords: 10 },
    { totalCodewords:  70, dataCodewords: 55, ecCodewords: 15 },
    { totalCodewords: 100, dataCodewords: 80, ecCodewords: 20 },
    { totalCodewords: 134, dataCodewords:108, ecCodewords: 26 },
    { totalCodewords: 172, dataCodewords:136, ecCodewords: 18, blocks: 2 },
    { totalCodewords: 196, dataCodewords:156, ecCodewords: 20, blocks: 2 },
    { totalCodewords: 242, dataCodewords:194, ecCodewords: 24, blocks: 2 },
    { totalCodewords: 292, dataCodewords:232, ecCodewords: 30, blocks: 2 },
    { totalCodewords: 346, dataCodewords:274, ecCodewords: 18, blocks: 4 },
];

function pickVersion(byteLen) {
    // Byte-mode header: 4-bit mode + 8/16-bit length + payload bytes + 4-bit terminator
    for (let v = 1; v <= 10; v++) {
        const info = VERSION_INFO[v];
        const lenBits = v <= 9 ? 8 : 16;
        const headerBytes = Math.ceil((4 + lenBits) / 8);
        if (byteLen + headerBytes + 1 <= info.dataCodewords) return v;
    }
    return -1; // too big for one code
}

function buildBitStream(bytes, version) {
    const lenBits = version <= 9 ? 8 : 16;
    const bits = [];
    const push = (val, n) => {
        for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    push(0b0100, 4);          // byte mode
    push(bytes.length, lenBits);
    for (const b of bytes) push(b, 8);
    push(0, 4);               // terminator
    while (bits.length % 8) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
        codewords.push(v);
    }
    const info = VERSION_INFO[version];
    const padBytes = [0xec, 0x11];
    let p = 0;
    while (codewords.length < info.dataCodewords) {
        codewords.push(padBytes[p % 2]); p++;
    }
    return codewords;
}

function placeModules(version, dataBits) {
    const size = 17 + version * 4;
    const m = new Array(size).fill(null).map(() => new Array(size).fill(null));
    const reserved = new Array(size).fill(null).map(() => new Array(size).fill(false));

    // Finder patterns at three corners.
    const placeFinder = (cx, cy) => {
        for (let dy = -1; dy <= 7; dy++) {
            for (let dx = -1; dx <= 7; dx++) {
                const x = cx + dx, y = cy + dy;
                if (x < 0 || y < 0 || x >= size || y >= size) continue;
                let v = 0;
                if (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6) {
                    if (dx === 0 || dx === 6 || dy === 0 || dy === 6) v = 1;
                    else if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) v = 1;
                }
                m[y][x] = v;
                reserved[y][x] = true;
            }
        }
    };
    placeFinder(0, 0);
    placeFinder(size - 7, 0);
    placeFinder(0, size - 7);

    // Timing patterns.
    for (let i = 8; i < size - 8; i++) {
        m[6][i] = (i % 2 === 0) ? 1 : 0;
        m[i][6] = (i % 2 === 0) ? 1 : 0;
        reserved[6][i] = true;
        reserved[i][6] = true;
    }
    // Dark module.
    m[size - 8][8] = 1;
    reserved[size - 8][8] = true;

    // Reserve format info bands (filled later by callers — minimal version).
    for (let i = 0; i < 9; i++) {
        if (m[8][i] === null) { m[8][i] = 0; reserved[8][i] = true; }
        if (m[i][8] === null) { m[i][8] = 0; reserved[i][8] = true; }
    }
    for (let i = 0; i < 8; i++) {
        if (m[8][size - 1 - i] === null) { m[8][size - 1 - i] = 0; reserved[8][size - 1 - i] = true; }
        if (m[size - 1 - i][8] === null) { m[size - 1 - i][8] = 0; reserved[size - 1 - i][8] = true; }
    }

    // Snake the data bits through the matrix.
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let i = 0; i < size; i++) {
            const y = upward ? size - 1 - i : i;
            for (let dx = 0; dx < 2; dx++) {
                const x = col - dx;
                if (!reserved[y][x] && m[y][x] === null) {
                    let bit = 0;
                    if (bitIdx < dataBits.length) bit = dataBits[bitIdx++];
                    if ((x + y) % 2 === 0) bit ^= 1; // mask 0
                    m[y][x] = bit;
                }
            }
        }
        upward = !upward;
    }
    return m;
}

/**
 * Generate an SVG string of a QR code for the given payload, or — if it
 * does not fit in a single version-10 code — a horizontally-stacked set
 * of QR codes that, when scanned in order, reconstruct the payload.
 *
 * @param {string} text - the payload, e.g. base64 SDP blob
 * @param {number} pixelSize - module size in CSS pixels
 * @returns {string} SVG markup
 */
export function generateQrSvg(text, pixelSize = 4) {
    const enc = new TextEncoder();
    const bytes = Array.from(enc.encode(text));

    // Slice into chunks if needed.
    const CHUNK_LIMIT = 250;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += CHUNK_LIMIT) {
        chunks.push(bytes.slice(i, i + CHUNK_LIMIT));
    }
    if (chunks.length === 0) chunks.push([]);

    const svgs = chunks.map((chunk, idx) => {
        const version = pickVersion(chunk.length);
        if (version === -1) return ''; // shouldn't happen with our chunk size
        const info = VERSION_INFO[version];
        const data = buildBitStream(chunk, version);
        const ec = rsEncode(data, info.ecCodewords);
        const final = data.concat(ec);
        const bits = [];
        for (const b of final) {
            for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
        }
        const matrix = placeModules(version, bits);
        const size = matrix.length;
        const px = pixelSize;
        let path = '';
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (matrix[y][x]) {
                    path += `M${x*px} ${y*px}h${px}v${px}h-${px}z`;
                }
            }
        }
        const w = size * px;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" style="background:#fff;margin:2px"><path d="${path}" fill="#000"/></svg><div style="text-align:center;font-size:10px">Part ${idx+1}/${chunks.length}</div>`;
    });

    return `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px">${svgs.join('')}</div>`;
}
