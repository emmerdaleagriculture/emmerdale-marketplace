import { redirect } from 'next/navigation';

// Submissions is the primary admin screen: the ops board (spec v1.6 §30)
// grew into the same list and left the bar on 2026-09-26. The old network
// dashboard lives on at /admin/metrics.
export default function AdminHome() {
  redirect('/admin/submissions');
}
