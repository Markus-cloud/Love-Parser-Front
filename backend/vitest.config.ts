import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [process.env.TEST_ENV_FILE, ".env.test", ".env.local", ".env"];
const loadedFiles = new Set<string>();

for (const candidate of envCandidates) {
  if (!candidate) {
    continue;
  }

  const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(__dirname, candidate);
  if (!loadedFiles.has(resolved) && fs.existsSync(resolved)) {
    loadEnv({ path: resolved, override: false });
    loadedFiles.add(resolved);
  }
}

process.env.NODE_ENV ??= "test";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.CORS_ORIGIN ??= "http://localhost:5173";
process.env.JWT_SECRET ??= "ci-jwt-secret-change-me";
process.env.SESSION_ENCRYPTION_KEY ??= "ci-session-encryption-key-change-me-32";
process.env.REQUEST_BODY_LIMIT ??= "1048576";
process.env.RATE_LIMIT_WINDOW_MS ??= "60000";
process.env.RATE_LIMIT_MAX ??= "100";
process.env.DATABASE_URL ??=
  process.env.CI === "true"
    ? "postgresql://love_parser:love_parser@127.0.0.1:5432/test-loveparser"
    : "postgresql://love_parser:love_parser@127.0.0.1:5432/love_parser_test";
process.env.POSTGRES_URL ??= process.env.DATABASE_URL;
process.env.REDIS_URL ??= "redis://127.0.0.1:6379/1";
process.env.TELEGRAM_API_ID ??= "0";
process.env.TELEGRAM_API_HASH ??= "ci-telegram-hash";
process.env.TELEGRAM_SESSION ??= "";
process.env.ROBOKASSA_MERCHANT_LOGIN ??= "demoMerchant";
process.env.ROBOKASSA_PASSWORD1 ??= "demoPassword1";
process.env.ROBOKASSA_PASSWORD2 ??= "demoPassword2";
process.env.ROBOKASSA_IS_TEST ??= "true";

const cpuCount = os.cpus()?.length ?? 4;
const maxThreads = Math.min(Math.max(cpuCount - 1, 2), 8);

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup/testEnv.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    bail: 1,
    pool: "threads",
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/**"],
      exclude: ["src/__tests__/**", "src/scripts/**"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
