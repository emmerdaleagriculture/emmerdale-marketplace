import { ViewOnce } from './Track';
import s from './home.module.css';

/**
 * "You could find someone yourself. Here's what that looks like."
 *
 * The page's main persuasion block. It replaced an earlier draft built around
 * "your number doesn't get passed round a list" — a jab at lead-generation
 * sites that Nav rejected, because it isn't what landowners actually worry
 * about. What they worry about is getting several prices, the work being done
 * properly, and the contractor being insured.
 *
 * Five of the six rows describe things the platform already does. The
 * exception is the fifth — see the note by it.
 */

type Row = { bad: string; good: React.ReactNode };

const ROWS: Row[] = [
  {
    bad: 'Three calls, one call back, and you’re still waiting on Thursday.',
    good: (
      <>
        <b>Several prices back, usually inside 24 hours.</b> The job goes to
        every approved operator covering your patch.
      </>
    ),
  },
  {
    bad: 'One number, and no idea whether it’s fair.',
    good: (
      <>
        <b>Prices side by side</b>, with each operator’s rating and how far away
        they are. Sort by price or by rating.
      </>
    ),
  },
  {
    bad: 'You have to ask if they’re insured, and take the answer on trust.',
    good: (
      <>
        <b>Public liability checked before they can quote</b>, along with
        training and certification. We hold the paperwork, so you never have the
        awkward conversation.
      </>
    ),
  },
  {
    bad: 'Cash on the day, handed over before you’ve walked the field.',
    good: (
      <>
        <b>You pay us, not the contractor.</b> We hold it until you’ve seen the
        work and said you’re happy.
      </>
    ),
  },
  // NOTE: this row is the one thing on the page with nothing written behind
  // it. The design flags it: what actually happens, who pays for a remedial
  // visit, and what the operator agreement says are all unwritten. An unbacked
  // guarantee is worse than no guarantee — the first customer who invokes it
  // and gets nothing writes the review that follows the brand around. Cut this
  // row or write the policy before the page goes live.
  {
    bad: 'If it’s done badly, it’s between you and a bloke with a tractor.',
    good: (
      <>
        <b>If it’s not right, you raise it with us</b> and we sort it with the
        operator. You’re not chasing anyone.
      </>
    ),
  },
  {
    bad: 'You need to be there, or take their word for it.',
    good: (
      <>
        <b>Before and after photos</b> land on your job page. Handy if the field
        is nowhere near the house.
      </>
    ),
  },
];

const Tick = () => (
  <svg
    className={s.vsBullet}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export function Comparison() {
  return (
    <section className={s.vs} id="why">
      <div className={s.container}>
        <p className={s.eyebrow}>Why not just ring round</p>
        <h2 className={s.sectionH}>
          You could find someone yourself. Here&rsquo;s what that looks like.
        </h2>
        <p className={s.lede}>
          Most people with a few acres have done this the hard way at least
          once. The difference isn&rsquo;t that we know contractors you
          don&rsquo;t — it&rsquo;s what sits behind the job once you&rsquo;ve
          picked one.
        </p>

        {/* The main persuasion block — the question worth answering is whether
            reaching it predicts converting. */}
        <ViewOnce event="view_comparison" />

        <div className={s.vsWrap}>
          <div className={s.vsHead}>
            <div className={s.vsHeadBad}>Finding someone yourself</div>
            <div className={s.vsHeadGood}>Through Emmerdale</div>
          </div>

          {ROWS.map((r) => (
            <div className={s.vsRow} key={r.bad}>
              <div className={`${s.vsCell} ${s.vsBad}`}>
                <span>
                  {/* Shown only on narrow screens, where the two columns stack
                      and the header row is hidden. */}
                  <span className={s.vsColLabel}>Yourself</span>
                  <span className={s.vsText}>{r.bad}</span>
                </span>
              </div>
              <div className={`${s.vsCell} ${s.vsGood}`}>
                <Tick />
                <span>
                  <span className={s.vsColLabel}>Emmerdale</span>
                  <span className={s.vsText}>{r.good}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
