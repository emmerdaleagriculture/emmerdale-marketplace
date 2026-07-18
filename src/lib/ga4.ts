import { getGoogleAccessToken } from './gsc';

/**
 * Google Analytics 4 Data API client. Ported from the HPM admin.
 *
 * Uses the same OAuth refresh token stored by the /admin/seo connect flow — the
 * consent screen requests `analytics.readonly` alongside the Search Console
 * scope. (Reconnect once after this scope was added, or GA4 calls 403.)
 *
 * Required env var: GA4_PROPERTY_ID — the NUMERIC property id (e.g. 123456789),
 * NOT the Measurement ID G-XXXX. Find it in GA4 → Admin → Property settings.
 */

export type Ga4Row = {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
};

export type Ga4ReportArgs = {
  startDate: string;
  endDate: string;
  dimensions: string[];
  metrics: string[];
  rowLimit?: number;
  orderBy?: { metric: string; desc?: boolean };
};

export function isGa4Configured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID);
}

/** The configured GA4 property id (for diagnostics). */
export function configuredGa4PropertyId(): string {
  return process.env.GA4_PROPERTY_ID ?? '';
}

/**
 * List the GA4 properties the connected account can access, with their numeric
 * ids — so the dashboard can show exactly what to set GA4_PROPERTY_ID to. Uses
 * the Admin API (covered by the analytics.readonly scope).
 */
export async function listGa4Properties(): Promise<Array<{ id: string; name: string; account: string }>> {
  const token = await getGoogleAccessToken();
  const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GA4 property list failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{ property: string; displayName?: string }>;
    }>;
  };
  const out: Array<{ id: string; name: string; account: string }> = [];
  for (const acc of json.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      out.push({
        id: p.property.replace('properties/', ''),
        name: p.displayName ?? p.property,
        account: acc.displayName ?? '',
      });
    }
  }
  return out;
}

export async function runGa4Report(args: Ga4ReportArgs): Promise<Ga4Row[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID not set');
  const token = await getGoogleAccessToken();

  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
    dimensions: args.dimensions.map((name) => ({ name })),
    metrics: args.metrics.map((name) => ({ name })),
    limit: String(args.rowLimit ?? 100),
  };
  if (args.orderBy) {
    body.orderBys = [
      { metric: { metricName: args.orderBy.metric }, desc: args.orderBy.desc ?? true },
    ];
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`GA4 report failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { rows?: Ga4Row[] };
  return json.rows ?? [];
}

/** Build a path → { sessions, engagedSessions, avgSessionDuration } map. */
export async function fetchGa4PageMetrics(
  startDate: string,
  endDate: string,
): Promise<Map<string, { sessions: number; engagedSessions: number; avgSessionDuration: number }>> {
  const rows = await runGa4Report({
    startDate,
    endDate,
    dimensions: ['pagePath'],
    metrics: ['sessions', 'engagedSessions', 'averageSessionDuration'],
    rowLimit: 500,
    orderBy: { metric: 'sessions', desc: true },
  });
  const out = new Map<string, { sessions: number; engagedSessions: number; avgSessionDuration: number }>();
  for (const r of rows) {
    const path = r.dimensionValues[0]?.value ?? '';
    out.set(path, {
      sessions: Number(r.metricValues[0]?.value ?? 0),
      engagedSessions: Number(r.metricValues[1]?.value ?? 0),
      avgSessionDuration: Number(r.metricValues[2]?.value ?? 0),
    });
  }
  return out;
}
