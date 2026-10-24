import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { cn, TYPE_ROLES as ROLES } from "@/lib/cn";

const SRC = join(__dirname, "../../src");

// Previews that mirror the store's own type scale, and the printed pick list.
const RAW_SIZE_ALLOWED = [
  "components/catalog/banner-preview.tsx",
  "components/catalog/category-card-preview.tsx",
  "components/orders/pick-list-sheet.tsx",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("type roles", () => {
  it("are the roles globals.css defines", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const defined = [...css.matchAll(/--text-([a-z]+(?:-[a-z]+)*):/g)].map((match) => match[1]);
    expect(defined).toEqual(ROLES);
  });

  it("survive cn() next to a text colour", () => {
    for (const role of ROLES) {
      expect(cn(`text-${role}`, "text-text-muted")).toBe(`text-${role} text-text-muted`);
      expect(cn("text-error-dark", `text-${role}`)).toBe(`text-error-dark text-${role}`);
    }
  });

  it("replace each other and raw sizes in cn()", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
    expect(cn("text-sm", "text-label")).toBe("text-label");
    expect(cn("text-label", "md:text-section")).toBe("text-label md:text-section");
  });

  it("replace raw Tailwind sizes in pages and components", () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => !RAW_SIZE_ALLOWED.includes(relative(SRC, path).replaceAll("\\", "/")))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .map((line, index) => ({ line, at: `${relative(SRC, path)}:${index + 1}` }))
          .filter(({ line }) => /(?<![\w:-])text-(xs|sm|base|lg|[2-9]?xl)(?![\w-])/.test(line))
          .map(({ at }) => at),
      );
    expect(offenders).toEqual([]);
  });
});
