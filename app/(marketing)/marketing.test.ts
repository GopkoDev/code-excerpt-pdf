import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { STORED_DATA } from "./privacy/stored-data"

/**
 * The marketing surface, and specifically the two legal pages.
 *
 * These pages make factual claims about a database nobody reading them can
 * inspect, so the claims are pinned to the code that makes them true rather
 * than to prose someone remembered to update. Three kinds of check live here:
 *
 * 1. **They are drafts and say so.** Neither page is lawyer-reviewed, and
 *    neither may invent a company, a jurisdiction or a contact address — the
 *    operator has to fill those in. A privacy notice signed by a fictional
 *    entity is worse than no privacy notice.
 * 2. **The inventory is pinned to `prisma/schema.prisma`**, exactly as
 *    `lib/db/account.test.ts` pins the subject-access export. A seventh model,
 *    or a seventh column on an existing model, fails here too — so a table
 *    cannot appear in the database and stay absent from the page that claims
 *    to list the database.
 * 3. **The awkward claims are pinned to the code.** The page says that merely
 *    *opening* a repository is recorded, and that the GitHub grant is
 *    read-only. Both are true of the code today; if either stops being true,
 *    this file fails rather than the page quietly becoming a lie.
 *
 * Nothing here renders React. The sources are read as text, the way
 * `prisma/migrations.test.ts` reads the checked-in SQL.
 */

const ROOT = join(import.meta.dirname, "..", "..")

const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8")

const TERMS = read("app", "(marketing)", "terms", "page.tsx")
const PRIVACY = read("app", "(marketing)", "privacy", "page.tsx")

const LEGAL_PAGES = [
  { name: "terms", source: TERMS },
  { name: "privacy", source: PRIVACY },
]

// ---------------------------------------------------------------------------
// 0. The pages exist, and can be reached
// ---------------------------------------------------------------------------

describe("the marketing surface", () => {
  it("owns `/`, so the scaffold placeholder is gone", () => {
    expect(existsSync(join(ROOT, "app", "(marketing)", "page.tsx"))).toBe(true)
    // Two files claiming `/` is a build error, but the scaffold page is also
    // the thing this slice exists to replace — so say it here too.
    expect(existsSync(join(ROOT, "app", "page.tsx"))).toBe(false)
  })

  it("sends a visitor to both entry points: no account, or an account", () => {
    const landing = read("app", "(marketing)", "page.tsx")
    expect(landing).toContain('href="/local"')
    expect(landing).toContain("<SignInButton")
  })

  it("reaches the legal pages from a footer both shells render", () => {
    const footer = read("components", "site-footer.tsx")
    expect(footer).toContain('href="/terms"')
    expect(footer).toContain('href="/privacy"')

    // A privacy notice nobody can navigate to is the actual failure mode.
    expect(read("app", "(marketing)", "layout.tsx")).toContain("<SiteFooter")
    expect(read("app", "(app)", "layout.tsx")).toContain("<SiteFooter")
  })
})

// ---------------------------------------------------------------------------
// 1. Drafts, and honest about it
// ---------------------------------------------------------------------------

describe("the legal pages are drafts and say so", () => {
  it.each(LEGAL_PAGES)(
    "$name renders the pending-legal-review notice",
    ({ source }) => {
      expect(source).toContain("<DraftNotice")
    }
  )

  it.each(LEGAL_PAGES)(
    "$name invents no company, jurisdiction or contact address",
    ({ source }) => {
      // An email address literal would read as a real contact route.
      expect(source).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
      // Company suffixes are how a fictional entity gets in.
      expect(source).not.toMatch(/\b(Inc\.|LLC|Ltd\.?|GmbH|S\.A\.|B\.V\.)\b/)
    }
  )

  it.each(LEGAL_PAGES)(
    "$name leaves visible placeholders for the operator to fill in",
    ({ source }) => {
      // `[OPERATOR]`, `[JURISDICTION]`, … — obviously unfinished on the page.
      // `\s` because Prettier is free to wrap a long one across two lines.
      const placeholders = source.match(/\[[A-Z][A-Z\s,/—-]+\]/g) ?? []
      expect(placeholders.length).toBeGreaterThanOrEqual(3)
    }
  )
})

// ---------------------------------------------------------------------------
// 2. The inventory is the schema, not a list someone maintains
// ---------------------------------------------------------------------------

const SCHEMA = read("prisma", "schema.prisma")

/** `model X { … }` bodies, in declaration order — same parse as account.test. */
const MODELS = [...SCHEMA.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(
  (match) => ({ name: match[1], body: match[2] })
)

const MODEL_NAMES = MODELS.map((model) => model.name)

/** Every field whose type is not another model — i.e. an actual column. */
function columnsOf(name: string): string[] {
  const model = MODELS.find((candidate) => candidate.name === name)
  if (!model) throw new Error(`No model ${name} in schema.prisma`)

  return [...model.body.matchAll(/^ {2}(\w+)\s+(\w+)(\[\])?\??/gm)]
    .filter((match) => !MODEL_NAMES.includes(match[2]))
    .map((match) => match[1])
}

describe("the privacy notice is pinned to prisma/schema.prisma", () => {
  it("describes every model the schema declares, and no other", () => {
    expect(Object.keys(STORED_DATA).sort()).toEqual([...MODEL_NAMES].sort())
  })

  it.each(MODEL_NAMES)("lists every column of %s", (name) => {
    const described = STORED_DATA[name as keyof typeof STORED_DATA]
    expect([...described.fields].sort()).toEqual([...columnsOf(name)].sort())
  })

  it("says when each row is written — the question a notice must answer", () => {
    for (const category of Object.values(STORED_DATA)) {
      expect(category.written.length).toBeGreaterThan(0)
      expect(category.why.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. The awkward claims, pinned to the code that makes them true
// ---------------------------------------------------------------------------

describe("the claims the page cannot prove to a reader", () => {
  it("admits that merely opening a repository is recorded", () => {
    expect(STORED_DATA.Repo.written).toMatch(/open/i)
  })

  it("is right about that: caching a listing upserts the Repo row", () => {
    const source = read("lib", "db", "tree-cache.ts")
    const writer = source.slice(source.indexOf("export async function write"))

    expect(writer).toContain("repo.upsert")
    expect(read("app", "api", "github", "tree", "route.ts")).toContain(
      "writeCachedTree"
    )
  })

  it("is right that the GitHub grant asks for no scope", () => {
    // A GitHub App's permissions come from the installation, so an empty
    // scope is what makes "read-only, on the repositories you picked" true.
    expect(read("auth.ts")).toMatch(/scope:\s*""/)
  })

  it("is right that no source code column exists to describe", () => {
    const fields = Object.values(STORED_DATA).flatMap(
      (category) => category.fields
    )
    for (const field of fields) {
      expect(field).not.toMatch(/^(content|text|body|source|blob|code)$/i)
    }
  })
})
