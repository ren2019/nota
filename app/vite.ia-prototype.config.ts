import { defineConfig } from "vite";
// Dedicated runner for the throwaway branch; no API or persistence middleware.
export default defineConfig({
  server: { host: "0.0.0.0", port: 5188, strictPort: true, allowedHosts: true },
  define: { __APP_VERSION__: JSON.stringify("IA-prototype") },
  cacheDir: "out/ia-prototype-cache",
});
