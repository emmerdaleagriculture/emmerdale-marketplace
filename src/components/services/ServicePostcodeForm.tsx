'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';

const FORWARD = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid'] as const;

/**
 * "Get prices for <service>": a postcode and a button. The service is already
 * known from the page, so /start sends step 1 for them (src=service) and they
 * land straight on the details — the same hand-off as the home page widget.
 *
 * A plain GET form so it works before hydration; ad params are forwarded once
 * hydrated, as on the paddock pages.
 */
export function ServicePostcodeForm({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [forwarded, setForwarded] = useState<[string, string][]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setForwarded(FORWARD.flatMap((k) => (q.get(k) ? [[k, q.get(k)!] as [string, string]] : [])));
    router.prefetch('/start');
  }, [router]);

  return (
    <form
      action="/start"
      method="get"
      className={a.card}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget);
        const params = new URLSearchParams();
        params.set('job', name);
        params.set('service', slug);
        const loc = String(data.get('loc') ?? '').trim();
        if (loc) params.set('loc', loc.slice(0, 200));
        params.set('src', 'service');
        for (const [k, v] of forwarded) params.set(k, v);
        setPending(true);
        router.push(`/start?${params}`);
      }}
    >
      <input type="hidden" name="job" value={name} />
      <input type="hidden" name="service" value={slug} />
      <input type="hidden" name="src" value="service" />
      {forwarded.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className={f.field}>
        <span className={f.label}>Where is the job? (postcode is ideal)</span>
        <input
          className={f.input}
          type="text"
          name="loc"
          required
          maxLength={200}
          autoComplete="postal-code"
          placeholder="e.g. SO24, or the nearest town"
        />
      </label>
      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'One moment…' : `Get prices for ${name.toLowerCase()}`}
        </button>
      </div>
    </form>
  );
}
