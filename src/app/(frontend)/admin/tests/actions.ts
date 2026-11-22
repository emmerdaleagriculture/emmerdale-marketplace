'use server';

import { revalidateTag } from 'next/cache';
import { getUser, isAdminEmail } from '@/lib/auth';
import { AB_TESTS_TAG } from './data';

/** Drop the hour-long cache so the page reads the database again. */
export async function refreshAbTestsAction(): Promise<void> {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorised');
  revalidateTag(AB_TESTS_TAG);
}
