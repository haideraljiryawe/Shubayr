import type { ReactNode } from "react";

/** The frame every work page and the inbox share: a width and a heading. */
export function WorkPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 lg:px-8 lg:py-10">
      <h1 className="text-2xl font-bold text-text">{title}</h1>
      {children}
    </div>
  );
}
