import Link from 'next/link';

/** A contractor's name, linking to their admin page when we know who they are. */
export function ContractorLink({ id, children }: { id?: string | null; children: React.ReactNode }) {
  return id ? <Link href={`/admin/contractors/${id}`}>{children}</Link> : <>{children}</>;
}
