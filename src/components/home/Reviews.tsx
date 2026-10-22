import s from './home.module.css';

type Review = { quote: string; name: string; county: string; job: string };

/**
 * What customers said, in their own words.
 *
 * Only reviews the customer has agreed to see published go here:
 * contractor_ratings carries no consent flag, so a comment left on /rate is
 * not on its own permission to quote it. Attribution is first name and county,
 * which is what the request email (2026-10-21) offered and nothing more.
 *
 * Adrian agreed on 2026-10-22. Both lines are his ratings of N J Green
 * Services, verbatim from contractor_ratings.
 */
const REVIEWS: Review[] = [
  {
    quote: 'Very helpful, knowledgeable and professional.',
    name: 'Adrian',
    county: 'West Sussex',
    job: 'Paddock renovation',
  },
  {
    quote: 'Great work, really appreciated.',
    name: 'Adrian',
    county: 'West Sussex',
    job: 'Fertiliser and lime',
  },
];

const Stars = () => (
  <span className={s.reviewStars} role="img" aria-label="5 out of 5 stars">
    ★★★★★
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
                <Stars />
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
