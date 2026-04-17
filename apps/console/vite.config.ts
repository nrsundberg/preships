import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, type Plugin } from "vite";

// Prisma 7 with `runtime = "cloudflare"` emits a `?module` WASM import.
// Vite/Rollup can't parse it — mark it external so wrangler resolves it.
const cloudflareWasmModule: Plugin = {
  name: "cloudflare-wasm-module",
  enforce: "pre",
  resolveId(id) {
    if (id.includes(".wasm") && id.endsWith("?module")) {
      return {
        id: "../../../app/db/generated/internal/query_compiler_fast_bg.wasm?module",
        external: true,
      };
    }
  },
};

export default defineConfig({
  plugins: [cloudflareWasmModule, tailwindcss(), reactRouter(), tsconfigPaths()],
});
