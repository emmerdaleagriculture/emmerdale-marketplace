import { describe, expect, it } from 'vitest';
import { fetchAll } from './fetchAll';

/** A fake API: `total` rows, capped at `cap` per response like PostgREST. */
function api(total: number, cap = 1000) {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to, from + cap - 1, total - 1);
    const data = from > end ? [] : Array.from({ length: end - from + 1 }, (_, i) => from + i);
    return { data, error: null };
  };
  return { page, calls };
}

describe('fetchAll', () => {
  it('returns a short table in one call', async () => {
    const { page, calls } = api(42);
    expect(await fetchAll(page)).toHaveLength(42);
    expect(calls).toEqual([[0, 999]]);
  });

  it('walks past the 1000-row cap in pages and stops on the short one', async () => {
    const { page, calls } = api(2350);
    const rows = await fetchAll(page);
    expect(rows).toHaveLength(2350);
    expect(rows[1000]).toBe(1000);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('stops at an exact page boundary with one extra empty read', async () => {
    const { page, calls } = api(1000);
    expect(await fetchAll(page)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it('honours the caller ceiling, trimming the last page to it', async () => {
    const { page, calls } = api(5000);
    expect(await fetchAll(page, { max: 2500 })).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2499]]);
  });

  it('throws the API error instead of returning a partial set', async () => {
    const page = async () => ({ data: null, error: { message: 'boom' } });
    await expect(fetchAll(page)).rejects.toThrow('boom');
  });
});
