// Guard for the JS budget: client components must not pull server-only or heavy modules.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) && !name.includes(".test.") ? [p] : [];
  });
}

const allFiles = files("src");
const clientFiles = allFiles.filter((f) => /^["']use client["']/m.test(readFileSync(f, "utf8")));

// Value imports (not `import type`) that would drag a library into the browser bundle.
const FORBIDDEN = [/from "zod"/, /from "@\/lib\/validation\//, /from "@\/db\//, /from "drizzle-orm/, /from "postgres"/, /from "nodemailer"/];

describe("client component imports", () => {
  it("finds client components", () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it.each(clientFiles)("%s imports no server-only or heavy modules", (file) => {
    const valueImports = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => /^import\s/.test(l) && !/^import type\s/.test(l));
    const offending = valueImports.filter((l) => FORBIDDEN.some((re) => re.test(l)));
    expect(offending).toEqual([]);
  });
});

// The whole message dictionary is ~18 KB gzip. Client code passes only the areas it uses to useT()
// (from "@/lib/i18n/de/<area>"); helpers shared with the client take a Pick<Messages, …>.
describe("message dictionary", () => {
  it("is imported as a whole only on the server", () => {
    const importers = allFiles.filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some((l) => /^import\s(?!type\s)/.test(l) && /from "(@\/lib\/i18n|\.)\/de"/.test(l)),
    );
    expect(importers).toEqual([join("src", "lib", "i18n", "server.ts")]);
  });
});
