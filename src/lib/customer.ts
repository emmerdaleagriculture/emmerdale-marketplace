import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Customer = Database['public']['Tables']['customers']['Row'];

/**
 * The signed-in customer, or null.
 *
 * A customer and a contractor are both rows against the same auth user table,
 * distinguished only by which side table they appear in. Nothing stops one
 * person being both — a contractor may want their own paddock topped — so this
 * asks the question directly rather than assuming an account has one purpose.
 */
export async function getCustomer(): Promise<Customer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await createServiceRoleClient()
    .from('customers')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  return data ?? null;
}
