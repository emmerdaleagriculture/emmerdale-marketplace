import { NextResponse } from 'next/server';
import { getUser, isAdminEmail } from '@/lib/auth';
import { isGscConnected, getConnectedEmail, isoDaysAgo } from '@/lib/gsc';
import {
  isGa4Configured,
  configuredGa4PropertyId,
  listGa4Properties,
  fetchGa4PageMetrics,
} from '@/lib/ga4';

export const dynamic = 'force-dynamic';

/**
 * Temporary admin-only GA4 diagnostic. Visit /admin/seo/ga4-debug while logged
 * in and share the JSON — it reveals the exact configured value (JSON-quoted so
 * stray whitespace shows), the properties the connected token can list, and the
 * result of the actual metrics call. Remove once GA4 is confirmed working.
 */
export async function GET() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'not authorised' }, { status: 403 });
  }

  const out: Record<string, unknown> = {
    connectedEmail: await getConnectedEmail().catch((e) => `err: ${String(e)}`),
    gscConnected: await isGscConnected().catch((e) => `err: ${String(e)}`),
    ga4Configured: isGa4Configured(),
    // JSON.stringify so quotes reveal any leading/trailing whitespace or G- prefix.
    ga4PropertyId_exactValue: JSON.stringify(configuredGa4PropertyId()),
  };

  try {
    out.accessibleProperties = await listGa4Properties();
  } catch (e) {
    out.listPropertiesError = e instanceof Error ? e.message : String(e);
  }

  if (isGa4Configured()) {
    try {
      const m = await fetchGa4PageMetrics(isoDaysAgo(31), isoDaysAgo(1));
      out.metricsRowCount = m.size;
      out.metricsSample = Array.from(m.entries()).slice(0, 3);
    } catch (e) {
      out.metricsError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(out, { status: 200 });
}
