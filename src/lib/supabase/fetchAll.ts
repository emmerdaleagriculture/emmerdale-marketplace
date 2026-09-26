/**
 * Read more than one API response's worth of rows.
 *
 * The hosted PostgREST returns at most 1000 rows per response and ignores a
 * larger client limit — `.limit(10000)` comes back with 1000 and so does a
 * Range header (measured 2026-09-26). Anything that needs the rows
 * themselves, rather than a count SQL can do, has to page.
 *
 * `page(from, to)` builds the query for one page: the caller's own select,
 * filters and — essential — an `.order()` that is deterministic (add `id` as
 * a tiebreak when the primary key is not unique enough), ending in
 * `.range(from, to)`. Pages are fetched in sequence until one comes back
 * short or `max` rows have been read; `max` is the caller's own ceiling, the
 * number the old `.limit()` meant.
 */
export const API_PAGE_ROWS = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { max = 20_000, pageRows = API_PAGE_ROWS }: { max?: number; pageRows?: number } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += pageRows) {
    const to = Math.min(from + pageRows, max) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    const got = data ?? [];
    rows.push(...got);
    if (got.length < to - from + 1) break;
  }
  return rows;
}
