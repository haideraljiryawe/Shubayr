import { Prisma } from '../../generated/prisma/client';

/** Search-only normalization. Stored catalog names are never rewritten. */
export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizedArabicSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`btrim(regexp_replace(translate(regexp_replace(lower(coalesce(${column}, '')), '[ًٌٍَُِّْٰـ]', '', 'g'), 'أإآٱىةؤئء', 'اااايهوي'), '\\s+', ' ', 'g'))`;
}
