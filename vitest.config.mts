import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests run without a database; *.db.test.ts need Postgres (pnpm test:db).
const needsDb = process.env.VITEST_DB === "1";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: needsDb ? ["src/**/*.db.test.ts"] : ["src/**/*.test.ts"],
    exclude: needsDb ? [] : ["src/**/*.db.test.ts"],
  },
});
