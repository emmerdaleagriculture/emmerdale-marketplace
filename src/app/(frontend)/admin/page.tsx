import { redirect } from 'next/navigation';

// The ops board is the primary admin screen (spec v1.6 §30) — the old
// network dashboard lives on at /admin/metrics.
export default function AdminHome() {
  redirect('/admin/ops');
}
