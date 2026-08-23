import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

/**
 * LumenTale reads Unity MonoBehaviour string tables only. unityfs-js imports an
 * image-decoder worker at module load time even when no texture is requested;
 * Vitest and Vite dev reject that worker's non-module default export. Keeping
 * the binding inert avoids the optional image path while preserving the parser.
 */
function unityFsTextTablesOnly() {
  const inertWorkerId = "\0unityfs-text-tables-only-worker";
  return {
    name: "unityfs-text-tables-only",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (
        source === "./textureDecoder.worker.js?worker&inline" &&
        importer?.includes("decoders/drivers/TextureDecoderPool.js")
      ) {
        return inertWorkerId;
      }
      return null;
    },
    load(id: string) {
      if (id === inertWorkerId) return "export default undefined;";
      return null;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    unityFsTextTablesOnly(),
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
  ].filter(Boolean),
  resolve: {
    // Lovable builds the browser application independently of pnpm's
    // patchedDependencies. Use the checked-in, verified UnityFS source so
    // the LumenTale writer always includes the LZ4HC/header fixes.
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: /^unityfs-js$/,
        replacement: path.resolve(__dirname, "./src/lib/vendor/unityfs-js/index.js"),
      },
      {
        find: /^unityfs-js\/(.*)$/,
        replacement: path.resolve(__dirname, "./src/lib/vendor/unityfs-js/$1"),
      },
    ],
  },
  // unityfs-js includes an optional image-decoder worker. ES output allows
  // Vite to bundle it safely alongside the application chunks; LumenTale only
  // reads MonoBehaviour text tables and never invokes image decoding.
  worker: {
    format: "es",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-switch",
            "@radix-ui/react-separator",
            "@radix-ui/react-label",
          ],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
  },
}));
