import Link from 'next/link';
import { Icon, Tile, Tiles } from './BooksUi';
import s from './books.module.css';

/**
 * Books as a Premium member sees it, with made-up figures, under a
 * "Premium" overlay: what a contractor without Premium gets when they open
 * the Books tab. Drawn from the real page's tiles and buttons rather than a
 * screenshot of anyone's books, so no member's figures are ever shown and it
 * follows the app's light and dark themes. Inert: nothing in it can be
 * tapped or focused.
 *
 * The app never sells membership (store rules), so there the overlay only
 * says what it is; on the web it links to the tiers.
 */
const SAMPLE = [
  { who: 'J. Harris, Oak Farm', amount: '£480.00', meta: '18 Nov · Sale · Topping, 6 acres', in: true },
  { who: 'Agri Supplies Ltd', amount: '-£126.40', meta: '17 Nov · Expense · Flail hammers', in: false },
  { who: 'Emmerdale job', amount: '£310.00', meta: '14 Nov · Emmerdale job · Paddock harrowing', in: true },
  { who: 'Fuel', amount: '-£92.15', meta: '12 Nov · Expense · Red diesel', in: false },
];

export function BooksPreview({ app }: { app: boolean }) {
  return (
    <div className={s.preview}>
      <div className={s.previewPage} aria-hidden="true" inert>
        <Tiles>
          <Tile icon="bank" label="Bank (1200)" value="£8,412.60" hint="As recorded in your books" tone="teal" />
          <Tile icon="coins" label="Income this year" value="£23,940.00" hint="6 Apr 2026 – 5 Apr 2027" tone="green" />
          <Tile icon="expenses" label="Expenses this year" value="£7,215.30" tone="amber" />
          <Tile icon="trend" label="Profit this year" value="£16,724.70" hint="Before tax" tone="green" />
        </Tiles>
        <div className={s.actionGrid}>
          <span className={s.actionMain}>
            <Icon name="plus" size={22} />
            <span>Record sale</span>
          </span>
          <span className={s.actionMain}>
            <Icon name="minus" size={22} />
            <span>Record expense</span>
          </span>
          <span className={s.actionSecond}>
            <Icon name="camera" />
            <span>Add receipts</span>
          </span>
          <span className={s.actionSecond}>
            <Icon name="invoice" />
            <span>New invoice</span>
          </span>
        </div>
        <div className={s.sectionHead}>
          <h2>Latest entries</h2>
        </div>
        <ul className={s.entryList}>
          {SAMPLE.map((e) => (
            <li key={e.who + e.meta}>
              <span className={s.entryWho}>{e.who}</span>
              <span className={s.entryAmount} data-in={e.in ? '' : undefined}>
                {e.amount}
              </span>
              <span className={s.entryMeta}>{e.meta}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={s.previewOverlay}>
        <div className={s.previewCard}>
          <span className={s.previewBadge}>Premium</span>
          <h2>Your books, done for you</h2>
          <p>
            Snap receipts and AI posts them, send invoices customers can pay by card, claim mileage, and see your VAT, profit and loss
            at any time. Books comes with Premium membership.
          </p>
          {!app && <Link href="/account/membership">See Premium →</Link>}
        </div>
      </div>
    </div>
  );
}
