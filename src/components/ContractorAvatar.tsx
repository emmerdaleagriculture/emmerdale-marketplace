import { avatarInitial } from '@/lib/avatars';
import s from './contractorAvatar.module.css';

/**
 * A contractor's picture in a circle, or the first letter of their name when
 * they have none. Plain <img>: the files are already 400px WebP squares on
 * Supabase's CDN, so the image optimiser would add nothing.
 */
export function ContractorAvatar({
  url,
  name,
  size = 40,
  className,
}: {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  const cls = className ? `${s.avatar} ${className}` : s.avatar;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className={cls} style={style} loading="lazy" />;
  }
  return (
    <span className={`${cls} ${s.initial}`} style={style} aria-hidden="true">
      {avatarInitial(name)}
    </span>
  );
}
