'use server';

import { getUser, isAdminEmail } from '@/lib/auth';
import { loadOutreach, type Outreach } from './outreach';

/** The outreach modal on /admin/submissions loads a job's lists through this. */
export async function loadOutreachAction(id: string): Promise<Outreach> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  return loadOutreach(id);
}
