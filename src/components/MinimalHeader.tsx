import Link from 'next/link';
import h from '@/components/SiteHeader.module.css';

/**
 * Static brand bar for anonymous, token-addressed pages (/start, /quote/…,
 * /my/…). Deliberately NOT <SiteHeader>: its HeaderAuthNav statically imports
 * the Supabase browser client (~50kB gz of client JS) that an anonymous
 * visitor never needs.
 */
export function MinimalHeader() {
  return (
    <header className={`${h.header} ${h.solid}`}>
      <div className={h.inner}>
        <Link href="/" className={h.brand}>
          Emmerdale Agriculture
        </Link>
      </div>
    </header>
  );
}
