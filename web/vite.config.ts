import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the export works from an IPFS gateway subpath or an ENS name without rewrites.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"] },
} as any);
