/**
 * Pages that run the job-creation flow (<LandingFlow>). Each records its own
 * views (landing_views.path), beacon events (page_events.path) and jobs
 * (job_submissions.landing_path), so one ad page can be judged against
 * another. /start/complete stays the single conversion URL for all of them.
 */
export const LANDING_FLOW_PATHS = ['/start', '/paddock-care'] as const;
export type LandingFlowPath = (typeof LANDING_FLOW_PATHS)[number];

/** A path from the client, trusted only if it is one of ours. */
export function landingFlowPath(v: unknown): LandingFlowPath {
  return (LANDING_FLOW_PATHS as readonly unknown[]).includes(v) ? (v as LandingFlowPath) : '/start';
}
