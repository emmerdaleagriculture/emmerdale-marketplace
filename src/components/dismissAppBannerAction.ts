'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Remember on the contractor's own row that they closed the "Get the app"
 * banner, so it stays closed in their other browsers too. Best effort: the
 * cookie DismissAppBanner sets already hides it in this one.
 */
export async function dismissAppBannerAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from('contractors')
    .update({ app_banner_dismissed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('app_banner_dismissed_at', null);
  if (error) console.error('app banner dismiss failed', { user: user.id, error: error.message });
}
