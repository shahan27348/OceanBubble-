/// <reference types="vitest/config" />
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
  preview: {
    port: 4173,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  build: {
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      output: {
        // React rarely changes between deploys; splitting it keeps it cached.
        manualChunks(id) {
          if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return "react";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["game/**", "services/**", "components/**", "gameConfig.ts"],
      reporter: ["text", "html"],
    },
  },
});
