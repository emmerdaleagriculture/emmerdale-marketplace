import s from './home.module.css';

/** stars only where the customer actually gave a rating on /rate. */
type Review = { quote: string; name: string; county: string; job: string; stars?: number };

/**
 * What customers said, in their own words.
 *
 * Only reviews the customer has agreed to see published go here:
 * contractor_ratings carries no consent flag, so a comment left on /rate is
 * not on its own permission to quote it. Attribution is first name and county,
 * which is what the request email (2026-10-21) offered and nothing more.
 *
 * All three agreed on 2026-10-22. Adrian's two lines are his ratings of
 * N J Green Services, verbatim from contractor_ratings; Robert's and David's
 * came in their email replies.
 */
const REVIEWS: Review[] = [
  {
    quote: 'Saved me a substantial amount of time trying to find a nearby reliable contractor.',
    name: 'Robert',
    county: 'Hampshire',
    job: 'Hedge cutting',
    stars: 5,
  },
  {
    quote: 'Very helpful, knowledgeable and professional.',
    name: 'Adrian',
    county: 'West Sussex',
    job: 'Paddock renovation',
    stars: 5,
  },
  {
    quote: 'Great work, really appreciated.',
    name: 'Adrian',
    county: 'West Sussex',
    job: 'Fertiliser and lime',
    stars: 5,
  },
  {
    quote: 'Quick and easy, thankyou.',
    name: 'David',
    county: 'West Sussex',
    job: 'Harrowing',
  },
];

const Stars = ({ n }: { n: number }) => (
  <span className={s.reviewStars} role="img" aria-label={`${n} out of 5 stars`}>
    {'★'.repeat(n)}
  </span>
);

export function Reviews() {
  return (
    <section className={s.reviews} aria-labelledby="reviews-title">
      <div className={s.container}>
        <p className={s.eyebrow}>What customers say</p>
        <h2 id="reviews-title" className={s.sectionH}>
          In their own words
        </h2>
        <ul className={s.reviewList}>
          {REVIEWS.map((r) => (
            <li key={r.quote} className={s.review}>
              <figure>
                {r.stars ? <Stars n={r.stars} /> : null}
                <blockquote className={s.reviewQuote}>
                  <p>&ldquo;{r.quote}&rdquo;</p>
                </blockquote>
                <figcaption className={s.reviewBy}>
                  <strong>
                    {r.name}, {r.county}
                  </strong>
                  <span>{r.job}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
