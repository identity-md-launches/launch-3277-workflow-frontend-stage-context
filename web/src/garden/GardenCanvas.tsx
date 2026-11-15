import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STYLES } from "../config";
import type { CandleRecord } from "../chain";
import { COLS, SECTION_SLOTS, SLOT, TERRACE, sectionRect, slotPosition } from "../layout";

type Cam = { x: number; y: number; s: number };
export type Quality = "full" | "mobile";

// Shared sprites: one glow and one candle image per style, drawn with drawImage for every candle
// (the canvas equivalent of instancing). No per-candle light or shadow is ever created.
function makeSprites() {
  // No 2D context (very old browser, blocked canvas): render nothing rather than crash the page.
  if (!document.createElement("canvas").getContext("2d")) return [];
  return STYLES.map((st) => {
    const glow = document.createElement("canvas");
    glow.width = glow.height = 128;
    const g = glow.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,226,160,0.95)");
    grad.addColorStop(0.18, hexA(st.flame, 0.55));
    grad.addColorStop(0.5, hexA(st.flame, 0.14));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const candle = document.createElement("canvas");
    candle.width = 32; candle.height = 48;
    const c = candle.getContext("2d")!;
    c.fillStyle = st.wax; roundRect(c, 9, 22, 14, 22, 3); c.fill();
    c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(11, 24, 3, 18);
    c.fillStyle = "#2a2116"; c.fillRect(15.4, 18, 1.2, 5);
    const fl = c.createRadialGradient(16, 13, 0, 16, 13, 8);
    fl.addColorStop(0, "#fffbe8"); fl.addColorStop(0.45, "#ffd36b"); fl.addColorStop(1, hexA(st.flame, 0));
    c.fillStyle = fl; c.beginPath(); c.ellipse(16, 12, 4.5, 9, 0, 0, Math.PI * 2); c.fill();
    return { glow, candle };
  });
}
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function drawFrog(c: CanvasRenderingContext2D, x: number, y: number, flip: number) {
  // An original seated frog sculpture in weathered, moss-flecked stone.
  c.save(); c.translate(x, y); c.scale(flip, 1);
  c.fillStyle = "#1d2a26"; c.beginPath(); c.ellipse(0, 22, 34, 9, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#3a4a3f"; c.beginPath(); c.ellipse(0, 4, 26, 22, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#46594b"; c.beginPath(); c.ellipse(0, -16, 20, 14, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(-11, -27, 7, 0, Math.PI * 2); c.arc(11, -27, 7, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#c9a54a"; c.beginPath(); c.arc(-11, -28, 3, 0, Math.PI * 2); c.arc(11, -28, 3, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "#26332c"; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -14, 9, 0.2, Math.PI - 0.2); c.stroke();
  c.fillStyle = "#33443a"; c.beginPath(); c.ellipse(-18, 18, 10, 6, -0.3, 0, Math.PI * 2); c.ellipse(18, 18, 10, 6, 0.3, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#b8923c"; c.beginPath(); c.arc(0, 6, 6, 0, Math.PI * 2); c.fill(); // medallion
  c.fillStyle = "rgba(88,128,74,0.5)"; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(rand(i) * 40 - 20, rand(i + 9) * 30 - 10, 2 + rand(i + 3) * 2, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

export function GardenCanvas(props: {
  records: CandleRecord[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  highlight: Set<number>;
  focus: { ids: number[]; nonce: number } | null;
  quality: Quality;
  reducedMotion: boolean;
  label: string;
}) {
  const { records, selectedId, onSelect, highlight, focus, quality, reducedMotion, label } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Cam>({ x: 0, y: -TERRACE / 2, s: 1 });
  const size = useRef({ w: 300, h: 300 });
  const sprites = useMemo(() => (typeof document !== "undefined" ? makeSprites() : []), []);
  const byPos = useMemo(() => { const a: (CandleRecord | undefined)[] = []; for (const r of records) a[r.position] = r; return a; }, [records]);
  const sections = Math.max(1, Math.ceil(records.length / SECTION_SLOTS));
  const [, force] = useState(0);
  const dirty = useRef(true);
  const lastFrame = useRef(0);

  const fitAll = useCallback(() => {
    const { w, h } = size.current;
    // start at the entrance: show section 0 and the gate, wider as occupancy grows
    const span = sections > 1 ? Math.min(3, Math.ceil(Math.sqrt(sections))) : 1;
    const worldW = TERRACE * (span + 0.4), worldH = TERRACE * (span * 0.5 + 0.9);
    cam.current = { x: 0, y: -TERRACE * span * 0.5 + 60, s: Math.min(w / worldW, h / worldH) };
    dirty.current = true;
  }, [sections]);

  const draw = useCallback((t: number) => {
    const cv = ref.current; if (!cv) return;
    const c = cv.getContext("2d"); if (!c || !sprites.length) return;
    const dpr = quality === "mobile" ? 1 : Math.min(devicePixelRatio || 1, 2);
    const { w, h } = size.current;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { x: cx, y: cy, s } = cam.current;
    // sky and moon (screen space, slight parallax)
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#050a14"); sky.addColorStop(1, "#0a1220");
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(220,228,255,0.5)";
    for (let i = 0; i < 70; i++) c.fillRect(((rand(i) * w * 1.5 - cx * 0.02) % w + w) % w, rand(i + 70) * h * 0.45, 1, 1);
    const mx = w * 0.82 - cx * 0.03, my = h * 0.12;
    const halo = c.createRadialGradient(mx, my, 4, mx, my, 70);
    halo.addColorStop(0, "rgba(190,205,240,0.22)"); halo.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = halo; c.fillRect(mx - 70, my - 70, 140, 140);
    c.fillStyle = "#aeb8cf"; c.beginPath(); c.arc(mx, my, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#050a14"; c.beginPath(); c.arc(mx + 5, my - 3, 12, 0, Math.PI * 2); c.fill();

    c.save();
    c.translate(w / 2, h / 2); c.scale(s, s); c.translate(-cx, -cy);
    const vx0 = cx - w / 2 / s, vx1 = cx + w / 2 / s, vy0 = cy - h / 2 / s, vy1 = cy + h / 2 / s;
    const visible = (r: { x: number; y: number; w: number; h: number }) => r.x < vx1 && r.x + r.w > vx0 && r.y < vy1 && r.y + r.h > vy0;
    // distant arcade silhouette behind the garden
    c.fillStyle = "#0b1422";
    const back = -TERRACE * (Math.ceil(Math.sqrt(sections)) + 1);
    for (let i = -6; i <= 6; i++) {
      const ax = i * 90;
      c.beginPath(); c.moveTo(ax - 40, back + 80); c.lineTo(ax - 40, back + 20); c.arc(ax, back + 20, 40, Math.PI, 0); c.lineTo(ax + 40, back + 80); c.closePath(); c.fill();
    }
    // reflecting pool at the entrance
    const pool = c.createLinearGradient(0, 40, 0, 150);
    pool.addColorStop(0, "#0c1a2b"); pool.addColorStop(1, "#08111d");
    c.fillStyle = pool; roundRect(c, -TERRACE * 0.9, 40, TERRACE * 1.8, 110, 30); c.fill();
    c.fillStyle = "rgba(174,184,207,0.12)"; c.fillRect(TERRACE * 0.35, 52, 6, 90);
    // terraces: one per open section, each with 256 dark pedestals
    for (let sec = 0; sec < sections; sec++) {
      const r = sectionRect(sec);
      if (!visible(r)) continue;
      c.fillStyle = "#111b29"; roundRect(c, r.x + 14, r.y + 14, r.w - 28, r.h - 28, 18); c.fill();
      c.strokeStyle = "#1e2b3d"; c.lineWidth = 3; c.stroke();
      if (s > 0.45) {
        c.fillStyle = "#18243a";
        for (let p = 0; p < SECTION_SLOTS; p++) {
          const pos = slotPosition(sec * SECTION_SLOTS + p);
          c.beginPath(); c.arc(pos.x, pos.y + 4, 5, 0, Math.PI * 2); c.fill();
        }
      }
      // flower beds at the corners (purple/pink, unlit)
      for (let f = 0; f < 24; f++) {
        const corner = f % 4, fx = corner % 2 ? r.x + r.w - 26 : r.x + 26, fy = corner > 1 ? r.y + r.h - 26 : r.y + 26;
        c.fillStyle = ["#3c2650", "#4a2a46", "#2b3d2c"][f % 3];
        c.beginPath(); c.arc(fx + (rand(sec * 31 + f) - 0.5) * 30, fy + (rand(sec * 17 + f) - 0.5) * 30, 4 + rand(f) * 3, 0, Math.PI * 2); c.fill();
      }
    }
    // entrance arch and two frog sculptures
    c.strokeStyle = "#2a3445"; c.lineWidth = 10;
    c.beginPath(); c.moveTo(-60, 40); c.lineTo(-60, -6); c.arc(0, -6, 60, Math.PI, 0); c.lineTo(60, 40); c.stroke();
    drawFrog(c, -TERRACE / 2 + 10, 12, 1);
    drawFrog(c, TERRACE / 2 - 10, 12, -1);

    // candles: additive glow first (lights the stone around it), then the candle itself
    const lod = s < 0.35 ? 0 : s < 1.3 ? 1 : 2;
    const animate = !reducedMotion && quality === "full";
    const now = Date.now() / 1000;
    c.globalCompositeOperation = "lighter";
    const firstSec = 0;
    for (let sec = firstSec; sec < sections; sec++) {
      const r = sectionRect(sec);
      if (!visible({ x: r.x - 40, y: r.y - 40, w: r.w + 80, h: r.h + 80 })) continue;
      for (let p = 0; p < SECTION_SLOTS; p++) {
        const rec = byPos[sec * SECTION_SLOTS + p]; if (!rec) continue;
        const pos = slotPosition(rec.position);
        const newborn = now - rec.createdAt < 86_400;
        const flick = animate ? 1 + 0.08 * Math.sin(t / 180 + rec.id * 1.7) : 1;
        const pulse = newborn ? (animate ? 1.5 + 0.25 * Math.sin(t / 500 + rec.id) : 1.5) : 1;
        const gs = SLOT * 2.6 * flick * pulse * (lod === 0 ? 1.4 : 1);
        c.drawImage(sprites[rec.style].glow, pos.x - gs / 2, pos.y - 4 - gs / 2, gs, gs);
      }
    }
    c.globalCompositeOperation = "source-over";
    if (lod > 0) for (let sec = 0; sec < sections; sec++) {
      const r = sectionRect(sec);
      if (!visible(r)) continue;
      for (let p = 0; p < SECTION_SLOTS; p++) {
        const rec = byPos[sec * SECTION_SLOTS + p]; if (!rec) continue;
        const pos = slotPosition(rec.position);
        if (pos.x < vx0 - SLOT || pos.x > vx1 + SLOT || pos.y < vy0 - SLOT || pos.y > vy1 + SLOT) continue;
        c.drawImage(sprites[rec.style].candle, pos.x - 8, pos.y - 20, 16, 24);
      }
    }
    // selection and "my candles" rings
    const ring = (id: number, color: string, wdt: number) => {
      const rec = records[id - 1]; if (!rec) return;
      const pos = slotPosition(rec.position);
      c.strokeStyle = color; c.lineWidth = wdt / s; c.beginPath(); c.arc(pos.x, pos.y - 6, SLOT * 0.55, 0, Math.PI * 2); c.stroke();
    };
    if (highlight.size <= 2000) highlight.forEach((id) => ring(id, "rgba(140,220,170,0.9)", 2));
    if (selectedId) ring(selectedId, "#f2b84b", 3);
    c.restore();
  }, [byPos, highlight, quality, records, reducedMotion, sections, selectedId, sprites]);

  // resize
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ro = new ResizeObserver(([e]) => {
      const first = size.current.w === 300 && size.current.h === 300;
      size.current = { w: e.contentRect.width, h: e.contentRect.height };
      if (first) fitAll();
      dirty.current = true;
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, [fitAll]);
  useEffect(() => { fitAll(); }, [sections > 1, fitAll]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { dirty.current = true; }, [draw]);

  // render loop: continuous only when flames animate; otherwise on demand
  useEffect(() => {
    let raf = 0;
    const animate = !reducedMotion && quality === "full";
    const loop = (t: number) => {
      if (dirty.current || (animate && t - lastFrame.current > 33)) { draw(t); dirty.current = false; lastFrame.current = t; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, quality, reducedMotion]);

  // focus on a set of candles (Find my candles / deep link)
  useEffect(() => {
    if (!focus || !focus.ids.length) return;
    const pts = focus.ids.map((id) => records[id - 1]).filter(Boolean).map((r) => slotPosition(r!.position));
    if (!pts.length) return;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const { w, h } = size.current;
    const s = Math.min(2.4, w / (maxX - minX + SLOT * 8), h / (maxY - minY + SLOT * 8));
    cam.current = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, s };
    dirty.current = true; force((n) => n + 1);
  }, [focus, records]);

  const zoomBy = (k: number, sx = size.current.w / 2, sy = size.current.h / 2) => {
    const cm = cam.current, { w, h } = size.current;
    const wx = cm.x + (sx - w / 2) / cm.s, wy = cm.y + (sy - h / 2) / cm.s;
    const s = Math.max(0.08, Math.min(4, cm.s * k));
    cam.current = { s, x: wx - (sx - w / 2) / s, y: wy - (sy - h / 2) / s };
    dirty.current = true;
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const onDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = 0; };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId); if (!prev) return;
    const pts = [...pointers.current.values()];
    if (pointers.current.size === 2) {
      const other = pts.find((p) => p !== prev)!;
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (d0 > 0) zoomBy(d1 / d0);
    } else {
      cam.current.x -= (e.clientX - prev.x) / cam.current.s; cam.current.y -= (e.clientY - prev.y) / cam.current.s;
    }
    moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); dirty.current = true;
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (moved.current > 6) return;
    const rect = ref.current!.getBoundingClientRect(), cm = cam.current, { w, h } = size.current;
    const wx = cm.x + (e.clientX - rect.left - w / 2) / cm.s, wy = cm.y + (e.clientY - rect.top - h / 2) / cm.s;
    let best: CandleRecord | null = null, bd = (SLOT * 0.7) ** 2;
    for (const r of records) { const p = slotPosition(r.position); const d = (p.x - wx) ** 2 + (p.y - 6 - wy) ** 2; if (d < bd) { bd = d; best = r; } }
    onSelect(best ? best.id : null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = 60 / cam.current.s;
    const k = e.key;
    if (k === "ArrowLeft") cam.current.x -= step; else if (k === "ArrowRight") cam.current.x += step;
    else if (k === "ArrowUp") cam.current.y -= step; else if (k === "ArrowDown") cam.current.y += step;
    else if (k === "+" || k === "=") zoomBy(1.25); else if (k === "-") zoomBy(0.8); else return;
    e.preventDefault(); dirty.current = true;
  };
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 0.87, e.clientX - r.left, e.clientY - r.top); };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  });

  return (
    <div className="garden-canvas">
      <canvas ref={ref} tabIndex={0} role="img" aria-label={label}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={(e) => pointers.current.delete(e.pointerId)} onKeyDown={onKey} />
      <div className="zoom" role="group" aria-label="Garden view">
        <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => zoomBy(0.75)}>−</button>
        <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.33)}>+</button>
        <button type="button" className="icon-btn" aria-label="Show the whole garden" onClick={fitAll}>⤢</button>
      </div>
    </div>
  );
}
export { COLS };
