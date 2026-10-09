/**
 * The "Re:" line every job email opens with (20261009180000). The database
 * stamps `job_title` on the payload as the email is queued; rows queued
 * before that carry at best a service and a district, which make a thinner
 * but still honest reference. Nothing for an email that is not about a job.
 */
export function jobReference(p: Record<string, unknown>): string | null {
  const title = typeof p.job_title === 'string' ? p.job_title.trim() : '';
  if (title) return title;
  const parts = [p.service, p.postcode_district].filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  return parts.length ? parts.join(', ') : null;
}

/** The body with its reference line, or unchanged when there is no job. */
export function withReference(text: string, p: Record<string, unknown>): string {
  const ref = jobReference(p);
  return ref ? `Re: ${ref}\n\n${text}` : text;
}
