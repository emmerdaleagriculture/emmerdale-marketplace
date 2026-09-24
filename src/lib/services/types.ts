/**
 * Content for one /services/[slug] page.
 *
 * Written, not generated: each page has to say something true and useful
 * about the job itself, or it is a thin copy of every other service page —
 * the thing the county pages were built to avoid. No prices or price bands
 * (a band the contractors cannot honour damages credibility; the page shows
 * real booked prices from recent_work instead, when there are any).
 */
export type ServiceFaq = { q: string; a: string };

export type ServiceContent = {
  /** The HOME_SERVICES card slug this page belongs to. */
  card: string;
  /** URL segment: /services/<path>. Lower-case, hyphenated, keyword-led. */
  path: string;
  /** Services-table names whose booked prices this page may show. */
  canonical: string[];
  /** <title> without the brand (the layout appends it). <= 50 chars. */
  metaTitle: string;
  /** <= 155 chars. */
  metaDescription: string;
  /** H1, plain and specific. */
  h1: string;
  /** 2–3 sentences under the H1: who it is for and what it fixes. */
  intro: string;
  /** "What's involved": 2–4 short paragraphs. */
  involves: string[];
  /** "When to do it": 1–2 paragraphs on season, timing and conditions. */
  when: string[];
  /** "What affects the price": 4–6 short bullet points. */
  priceFactors: string[];
  /** "Good to know": 2–4 practical tips or warnings. */
  goodToKnow: string[];
  /** 3–4 questions people actually search. */
  faqs: ServiceFaq[];
  /** 2–4 related card slugs. */
  related: string[];
};
