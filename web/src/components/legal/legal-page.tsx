import type { ReactNode } from "react";
import type { LegalDocument } from "@/content/legal";

/**
 * A policy page: title, last-updated line, a contents list and its sections.
 * The texts (src/content/legal.ts) are drafts for the owner's review.
 */
export function LegalPage({
  page,
  document,
  updated,
  contentsLabel,
  children,
}: {
  page: string;
  document: LegalDocument;
  /** "Last updated …", or null until the owner sets the policy date. */
  updated: string | null;
  contentsLabel: string;
  children?: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 lg:px-8" data-testid={`legal-${page}`}>
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">{document.title}</h1>
        {updated ? (
          <p className="text-xs text-text-muted" data-testid="legal-updated">
            {updated}
          </p>
        ) : null}
        <p className="mt-2 text-base leading-relaxed text-text-muted">{document.intro}</p>
      </header>

      <nav aria-label={contentsLabel} className="mt-6 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold text-text">{contentsLabel}</p>
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {document.blocks.map((block, index) => (
            <li key={block.heading}>
              <a href={`#section-${index + 1}`} className="text-primary-dark underline-offset-4 hover:underline">
                {block.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 flex flex-col gap-8">
        {document.blocks.map((block, index) => (
          <section key={block.heading} id={`section-${index + 1}`} className="scroll-mt-24">
            <h2 className="text-lg font-bold text-text">{block.heading}</h2>
            {block.items?.length ? (
              <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-text">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {block.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm leading-relaxed text-text">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
      {children}
    </article>
  );
}
