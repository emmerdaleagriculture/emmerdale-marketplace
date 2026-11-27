'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';
import { MAX_WIDTH_M, MIN_WIDTH_M, parseTrack, replay, RUN_TASKS, simplifyTrack, type RunTask } from '@/lib/info/coverage';

/**
 * Saving and deleting coverage map runs. They run as the signed-in user, so
 * RLS on coverage_runs (owner only) keeps one person's runs out of another's.
 * The figures stored are worked out here from the track as it is stored, so
 * the saved map and its numbers always agree.
 */

export type SaveRunInput = {
  task: string;
  site: string;
  widthM: number;
  /** ms since 1970 */
  startedAt: number;
  endedAt: number;
  track: unknown;
};

export type SaveRunResult = { ok: true; id: string } | { ok: false; error: string };

const DAY_MS = 86400000;

export async function saveCoverageRunAction(input: SaveRunInput): Promise<SaveRunResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      ok: false,
      error: 'Sign in to save the run. It stays on this phone until you do.',
    };

  const task = (RUN_TASKS as readonly string[]).includes(input.task) ? (input.task as RunTask) : null;
  if (!task)
    return {
      ok: false,
      error: 'Pick the job: spraying, fertilising, seeding or other.',
    };
  const widthM = Number(input.widthM);
  if (!(widthM >= MIN_WIDTH_M && widthM <= MAX_WIDTH_M))
    return {
      ok: false,
      error: `The working width must be between ${MIN_WIDTH_M} and ${MAX_WIDTH_M} metres.`,
    };
  const site =
    String(input.site ?? '')
      .trim()
      .slice(0, 200) || null;

  const started = Number(input.startedAt);
  const ended = Number(input.endedAt);
  const now = Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started || ended > now + 5 * 60000 || ended - started > 2 * DAY_MS) {
    return {
      ok: false,
      error: 'The run’s start and finish times don’t look right. Check the phone’s clock.',
    };
  }

  const raw = parseTrack(input.track);
  if (!raw)
    return {
      ok: false,
      error: 'There is no track to save: the machine needs to have moved with the map running.',
    };
  const track = simplifyTrack(raw);
  const grid = replay(track, widthM);
  if (!grid) return { ok: false, error: 'There is no track to save.' };
  const s = grid.stats();

  const { data, error } = await supabase
    .from('coverage_runs')
    .insert({
      user_id: user.id,
      task,
      site,
      width_m: widthM,
      started_at: new Date(started).toISOString(),
      ended_at: new Date(ended).toISOString(),
      active_seconds: Math.min(Math.round(s.activeSeconds), Math.round((ended - started) / 1000)),
      distance_m: Math.round(s.distanceM * 10) / 10,
      covered_ha: Math.round(s.coveredHa * 10000) / 10000,
      overlap_ha: Math.round(s.overlapHa * 10000) / 10000,
      applied_ha: Math.round(s.appliedHa * 10000) / 10000,
      track: track as unknown as Json,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[coverage-map] save failed:', error);
    return {
      ok: false,
      error: 'That didn’t save. Check your signal and try again: the run is still on this phone.',
    };
  }
  revalidatePath('/info/coverage-map');
  return { ok: true, id: data.id };
}

export async function deleteCoverageRunAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in first.' };
  const { error } = await supabase.from('coverage_runs').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('[coverage-map] delete failed:', error);
    return { ok: false, error: 'That didn’t delete. Please try again.' };
  }
  revalidatePath('/info/coverage-map');
  revalidatePath('/info/spray-diary');
  return { ok: true };
}
