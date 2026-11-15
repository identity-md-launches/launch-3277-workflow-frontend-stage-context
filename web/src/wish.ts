// Optional wish text stays in this browser's localStorage only. It is never sent to a contract,
// an RPC, analytics or any other service.
const KEY = "wg:wishes:v1";
export const loadWishes = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
export function saveWish(ids: number[], text: string) {
  if (!text.trim()) return;
  const all = loadWishes();
  for (const id of ids) all[id] = text.trim();
  localStorage.setItem(KEY, JSON.stringify(all));
}
export function exportWishes() {
  const blob = new Blob([JSON.stringify(loadWishes(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "wish-garden-wishes.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function importWishes(file: File) {
  const data = JSON.parse(await file.text());
  if (!data || typeof data !== "object") throw new Error("Not a wish export");
  const all = { ...loadWishes() };
  for (const [k, v] of Object.entries(data)) if (/^\d+$/.test(k) && typeof v === "string") all[k] = v.slice(0, 500);
  localStorage.setItem(KEY, JSON.stringify(all));
}
