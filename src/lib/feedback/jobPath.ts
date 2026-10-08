/**
 * Which job page a problem report came from, read off the page's own path.
 *
 * Pure, so it can be tested: the token is the only thing that ties a report
 * from /my/<token> or /quote/<token> to a job and a person, and the action
 * resolves it server-side rather than trusting anything the form says.
 */
const JOB_PATH = /^\/(my|quote)\/([0-9a-f]{48})(?:[/?#]|$)/i;

export type JobPath = { side: 'customer'; token: string } | { side: 'contractor'; token: string };

export function parseJobPath(path: string | null | undefined): JobPath | null {
  const m = path ? JOB_PATH.exec(path) : null;
  if (!m) return null;
  return { side: m[1].toLowerCase() === 'my' ? 'customer' : 'contractor', token: m[2].toLowerCase() };
}
