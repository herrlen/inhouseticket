import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugFromDomain, slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it.each([
    ["Müller & Söhne GmbH", "mueller-soehne-gmbh"],
    ["  Agentur  Süß ", "agentur-suess"],
    ["Café Crème", "cafe-creme"],
    ["---", ""],
  ])("%j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("slugFromDomain", () => {
  it.each([
    ["firma.de", "firma"],
    ["it.firma.de", "it-firma"],
    ["firma.co.uk", "firma"],
    ["mein-shop.com", "mein-shop"],
  ])("%s → %s", (domain, expected) => {
    expect(slugFromDomain(domain)).toBe(expected);
  });
});

describe("uniqueSlug", () => {
  it("appends a counter when taken", async () => {
    const taken = new Set(["firma", "firma-2"]);
    expect(await uniqueSlug("firma", async (s) => taken.has(s))).toBe("firma-3");
  });

  it("skips reserved words", async () => {
    expect(await uniqueSlug("login", async () => false)).toBe("login-2");
  });
});

describe("RESERVED_SLUGS", () => {
  /** Top-level URL segments of the app: route folders (route groups resolved), metadata files, public/. */
  function topLevelSegments(): string[] {
    const segments = new Set<string>();
    const hasRoute = (dir: string): boolean =>
      readdirSync(dir, { withFileTypes: true }).some((e) => (e.isDirectory() ? hasRoute(join(dir, e.name)) : /^(page|route)\.tsx?$/.test(e.name)));
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const name = entry.name;
        if (entry.isDirectory()) {
          if (/^\(.+\)$/.test(name)) walk(join(dir, name)); // route group: its children are top-level
          else if (!/^[[_]/.test(name) && hasRoute(join(dir, name))) segments.add(name); // skip [dynamic], _private and non-route folders
        } else {
          // File-based metadata routes: opengraph-image.tsx → /opengraph-image, robots.ts → /robots.txt …
          const base = name.replace(/\.(tsx?|jsx?)$/, "");
          if (base !== name && !/^(layout|page|template|loading|error|not-found|global-error|default|route)$/.test(base) && !base.includes(".")) segments.add(base);
        }
      }
    };
    walk("src/app");
    for (const name of readdirSync("public")) segments.add(name.replace(/\.[^.]+$/, ""));
    // Only what a workspace slug could spell (a-z, 0-9, "-"): ".well-known" or "stat.js" can never collide.
    return [...segments].filter((s) => /^[a-z0-9-]+$/.test(s));
  }

  it("covers every top-level route", () => {
    const segments = topLevelSegments();
    expect(segments).toEqual(expect.arrayContaining(["api", "mcp", "stat", "admin", "login", "register", "oauth", "datenschutz"]));
    expect(segments.filter((s) => !RESERVED_SLUGS.has(s))).toEqual([]);
  });

  it.each(["register", "oauth", "forgot-password", "reset-password", "set-password", "stat", "admin", "api", "mcp", "login"])(
    "never hands out %s",
    async (slug) => {
      expect(RESERVED_SLUGS.has(slug)).toBe(true);
      expect(await uniqueSlug(slug, async () => false)).toBe(`${slug}-2`);
    },
  );
});
