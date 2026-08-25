import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts")) return "recharts";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("lucide-react")) return "lucide";
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
