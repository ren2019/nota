import { defineConfig } from "vite";
// Build the review artifact including raw upstream markup and isolated CSS.
export default defineConfig({
  build: {
    outDir: "out/ia-artifact", emptyOutDir: true,
    lib: { entry: "src/nota/ia-prototype/standalone.ts", name: "NotaIA", formats: ["iife"], fileName: () => "prototype.js" },
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
