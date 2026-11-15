import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { INLINE_MD_TOKEN as TOKEN } from '@/lib/inlineMd';

export { stripInlineMd } from '@/lib/inlineMd';

/**
 * The two inline marks hand-written page copy needs: `[anchor](/path)` and
 * `**bold**`. Lets content files carry internal links without becoming JSX.
 * Only site-relative paths become links; anything else is left as text.
 */
export function InlineMd({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    if (m[1] !== undefined) {
      out.push(
        <Link key={i++} href={m[2]} prefetch={false}>
          {m[1]}
        </Link>,
      );
    } else {
      out.push(<strong key={i++}>{m[3]}</strong>);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
