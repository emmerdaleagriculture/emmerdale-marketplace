import type { Metadata } from 'next';
import Link from 'next/link';
import { NewJobForm } from './NewJobForm';
import { getCounties, getServices } from '@/lib/reference';
import s from '../../admin.module.css';

export const metadata: Metadata = { title: 'New job — Admin' };

export default async function NewJobPage() {
  const [services, counties] = await Promise.all([getServices(), getCounties()]);

  return (
    <div>
      <Link href="/admin/jobs" className={s.back}>
        ← All jobs
      </Link>
      <h1 className={s.h1}>Post a job</h1>
      <p className={s.sub}>
        Enter the enquiry. The postcode resolves to a county; matching contractors
        are notified when it opens for claiming.
      </p>
      <NewJobForm services={services} counties={counties} />
    </div>
  );
}
