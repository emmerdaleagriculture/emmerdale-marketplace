'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';

/**
 * The front-page capture. It asks the same two questions step 1 of /start asks
 * and hands the answers over in the URL, so an organic visitor arrives in the
 * flow with their description already typed — one funnel, entered from the
 * indexable side rather than a paid click.
 *
 * A plain GET form, so it still works before hydration (or without JS). With
 * JS it becomes a client-side transition into a route we've already prefetched.
 *
 * Attribution: `src` marks this hop as organic and is server-rendered, so it
 * survives a pre-hydration submit; /start folds it into utm_source only when
 * there's no real ad attribution, which keeps organic arrivals out of the
 * "(direct)" bucket on the paid funnel report. It deliberately isn't a `utm_*`
 * param — gtag.js is live site-wide, and UTM-tagging an internal link would
 * restart the GA4 session and overwrite the visitor's true acquisition source.
 *
 * The ad params below are read from the current URL, so they can only be
 * forwarded once hydrated: someone who lands here from an ad and submits in the
 * gap keeps `src` but loses the gclid. Reading them during render would mean
 * making all 89 of these pages dynamic, which isn't worth that window.
 */

/** Mirrors the /start textarea, so we never hand over text the flow rejects. */
const MAX_JOB = 2000;
const MAX_LOC = 120;
const SOURCE = 'paddock';
const FORWARD = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid'] as const;

export function StartJobForm() {
  const router = useRouter();
  const [forwarded, setForwarded] = useState<[string, string][]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    router.prefetch('/start');
    const q = new URLSearchParams(window.location.search);
    setForwarded(
      FORWARD.map((k) => [k, q.get(k) ?? ''] as [string, string]).filter(([, v]) => v),
    );
  }, [router]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;

    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const job = String(data.get('job') ?? '').trim();
    const loc = String(data.get('loc') ?? '').trim();
    if (job) params.set('job', job.slice(0, MAX_JOB));
    if (loc) params.set('loc', loc.slice(0, MAX_LOC));
    params.set('src', SOURCE);
    for (const [k, v] of forwarded) params.set(k, v);

    setPending(true);
    router.push(`/start?${params.toString()}`);
  };

  return (
    <form action="/start" method="get" className={a.card} onSubmit={onSubmit}>
      <input type="hidden" name="src" value={SOURCE} />
      {forwarded.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <label className={f.field}>
        <span className={f.label}>What needs doing?</span>
        <textarea
          className={f.textarea}
          name="job"
          required
          minLength={10}
          maxLength={MAX_JOB}
          rows={4}
          placeholder="e.g. Two paddocks about 3 acres each, grass is well over knee height and full of docks — needs topping before winter"
        />
        <span className={f.hint}>Your own words are fine — no need for the technical term.</span>
      </label>

      <label className={f.field}>
        <span className={f.label}>Where is it? (postcode is ideal)</span>
        <input
          className={f.input}
          type="text"
          name="loc"
          maxLength={MAX_LOC}
          autoComplete="postal-code"
          placeholder="e.g. SO24, or the nearest town"
        />
      </label>

      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'One moment…' : 'Get started'}
        </button>
      </div>
    </form>
  );
}
