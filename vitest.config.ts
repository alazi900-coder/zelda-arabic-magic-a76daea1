import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // These ROM-producing diagnostics require local Reshef bridges and a reference ROM.
    // Keep portable Reshef coverage in the default suite; run diagnostics explicitly when restored.
    exclude: [
      "src/test/manual-reshef-*.test.ts",
      "src/test/reshef-image-editor.test.ts",
      "src/test/reshef-two-layer-font.test.ts",
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
