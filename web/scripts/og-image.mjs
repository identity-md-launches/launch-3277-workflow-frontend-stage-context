// Renders public/og.png (1200x630) with no browser: a dim moon, a stone arch and one lit candle
// over a midnight garden, matching the site's palette. Pure Node (zlib) PNG encoder.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
const W = 1200, H = 630, px = Buffer.alloc(W * H * 3);
const mix = (a, b, t) => a + (b - a) * t;
const set = (x, y, c, a = 1) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; for (let k = 0; k < 3; k++) px[i + k] = Math.round(mix(px[i + k], c[k], a)); };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = y / H; set(x, y, [mix(5, 13, t), mix(10, 23, t), mix(20, 36, t)]); }
let s = 7; const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = 0; i < 160; i++) set(Math.floor(r() * W), Math.floor(r() * H * 0.5), [220, 228, 255], 0.6);
const disc = (cx, cy, rad, c, a = 1) => { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) set(x, y, c, a); };
const glow = (cx, cy, rad, c, k) => { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) { const d = Math.hypot(x - cx, y - cy) / rad; if (d < 1) set(x, y, c, k * (1 - d) ** 2); } };
glow(1010, 110, 140, [190, 205, 240], 0.35); disc(1010, 110, 34, [174, 184, 207]); disc(1024, 102, 31, [5, 10, 20]);
for (let i = 0; i < 4; i++) { const ax = [60, 210, 990, 1140][i]; for (let y = 190; y < 420; y++) for (let x = ax - 60; x < ax + 60; x++) if (y > 250 || (x - ax) ** 2 + (y - 250) ** 2 < 3600) set(x, y, [11, 20, 34]); }
for (let y = 420; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [8, 17, 29]);
for (let y = 250; y < 480; y++) for (let x = 500; x < 700; x++) { const inner = (x - 600) ** 2 + (y - 330) ** 2; const ring = (y < 330 && inner > 80 ** 2 && inner < 98 ** 2) || (y >= 330 && ((x > 502 && x < 520) || (x > 680 && x < 698))); if (ring) set(x, y, [42, 52, 69]); }
glow(600, 425, 160, [242, 184, 75], 0.55); glow(600, 425, 60, [255, 226, 160], 0.6);
for (let y = 430; y < 476; y++) for (let x = 588; x < 612; x++) set(x, y, [239, 230, 210]);
for (let y = 398; y < 430; y++) for (let x = 592; x < 608; x++) if (((x - 600) / 7) ** 2 + ((y - 414) / 15) ** 2 <= 1) set(x, y, [255, 211, 107]);
for (const [cx, cy, rr, c] of [[420, 480, 12, [60, 38, 80]], [446, 492, 9, [74, 42, 70]], [770, 486, 12, [60, 38, 80]], [748, 497, 8, [43, 61, 44]]]) disc(cx, cy, rr, c);
const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(new URL("../public/og.png", import.meta.url), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
console.log("public/og.png written");
