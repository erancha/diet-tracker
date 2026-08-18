/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Serves the questionnaire config from its source-of-truth location during local dev,
// mirroring production where sync-frontend.sh publishes it at the site origin root.
function serveQuestionnaire(): Plugin {
  return {
    name: "serve-questionnaire",
    configureServer(server) {
      server.middlewares.use("/questionnaire.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(fileURLToPath(new URL("../config/questionnaire.json", import.meta.url))));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveQuestionnaire()],
  // Cognito's registered local callback URL is http://localhost:8000/ — the dev server must
  // stay on that port for local sign-in to work.
  server: { port: 8000 },
  preview: { port: 8000 },
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    // Globals are on so Testing Library's between-test DOM cleanup can self-register.
    globals: true,
    setupFiles: "./src/test-setup.ts",
  },
});
