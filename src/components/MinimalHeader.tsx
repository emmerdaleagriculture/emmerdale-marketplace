import Link from 'next/link';
import { BrandMark } from '@/components/home/BrandMark';
import h from '@/components/SiteHeader.module.css';
import { SocialLinks } from '@/components/SocialLinks';

/**
 * Static brand bar for anonymous, token-addressed pages (/start, /quote/…,
 * /my/…). Deliberately NOT <SiteHeader>: its SiteNav statically imports
 * the Supabase browser client (~50kB gz of client JS) that an anonymous
 * visitor never needs.
 */
export function MinimalHeader() {
  return (
    <header className={`${h.header} ${h.solid}`} data-app-hide>
      <div className={h.inner}>
        <Link href="/" className={h.brand}>
          <BrandMark size={28} className={h.brandMark} />
          <span>Emmerdale Agriculture</span>
        </Link>
        <SocialLinks className={h.social} />
      </div>
    </header>
  );
}
