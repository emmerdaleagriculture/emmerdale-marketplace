'use client';

import { useEffect, useState } from 'react';
import { BASIS_LABEL, RAGWORT_RULE, optionsFor, productOf, type Option, type Stock, type Weed } from '@/lib/info/weeds';
import css from './weeds.module.css';

/**
 * A weed's herbicides, sifted by what grazes the field. The page is static;
 * the choice is made here and remembered on the device, so the next weed
 * opens on the same answer.
 */
const KEY = 'ea_info_stock';
const STOCK: { key: Stock; label: string }[] = [
  { key: 'horses', label: 'Horses' },
  { key: 'livestock', label: 'Cattle or sheep' },
  { key: 'none', label: 'No stock' },
];

function Card({ option, stock, out }: { option: Option; stock: Stock; out?: boolean }) {
  const p = productOf(option.product);
  const rows: [string, string | undefined][] = [
    ['How', p.method],
    ['Dose', p.dose],
    ['Water', p.water],
    ['Knapsack', p.knapsack],
    ['When', p.window],
    ['Rain', p.rainfast],
    ['Cutting', p.cutting],
    ['Clover', p.clover],
    ['Manure', p.manure],
    ['Near water', p.buffer],
  ];
  return (
    <li className={`${css.product} ${out ? css.productOut : ''}`}>
      <div className={css.productHead}>
        <h3 className={css.productName}>{p.name}</h3>
        <span className={css.basis} data-basis={option.basis}>
          {BASIS_LABEL[option.basis]}
        </span>
      </div>
      <div className={css.productMeta}>
        {p.maker} · {p.actives} · MAPP {p.mapp}
      </div>
      {out ? (
        <p className={css.outWhy}>{p.horseNote}</p>
      ) : (
        <>
          {option.note && <p className={css.optionNote}>{option.note}</p>}
          {stock !== 'none' && (
            <div className={css.stockBox}>
              <div className={css.stockDays}>{p.stockDays ? `Stock out for at least ${p.stockDays} days` : 'Stock out until the weeds are gone'}</div>
              <p>{p.stock}</p>
              {stock === 'horses' && p.horseNote && <p>{p.horseNote}</p>}
            </div>
          )}
          <dl className={css.facts}>
            {rows.map(([k, v]) =>
              v ? (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {p.note && <p className={css.productNote}>{p.note}</p>}
          <a href={p.url} rel="noopener" className={css.labelLink}>
            {p.maker}’s page and label
          </a>
        </>
      )}
    </li>
  );
}

export function WeedOptions({ weed }: { weed: Weed }) {
  const [stock, setStock] = useState<Stock>('horses');
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'horses' || v === 'livestock' || v === 'none') setStock(v);
    } catch {}
  }, []);
  const pick = (s: Stock) => {
    setStock(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {}
  };
  const { usable, ruledOut } = optionsFor(weed, stock);

  return (
    <section>
      <h2 className={css.h2}>What grazes the field?</h2>
      <div className={css.stock} role="group" aria-label="What grazes the field">
        {STOCK.map((s) => (
          <button key={s.key} type="button" aria-pressed={stock === s.key} onClick={() => pick(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      {stock !== 'none' && <p className={css.ragwort}>{RAGWORT_RULE}</p>}
      {stock === 'none' && <p className={css.ragwort}>With no stock on it, the cutting interval is the one to watch: several of these forbid hay or silage for a year, and some are for grazing land only.</p>}

      <h2 className={css.h2}>
        {usable.length} {usable.length === 1 ? 'product' : 'products'} {stock === 'horses' ? 'for a horse paddock' : stock === 'livestock' ? 'for cattle or sheep grazing' : 'for ungrazed grass'}
      </h2>
      <ul className={css.products}>
        {usable.map((o) => (
          <Card key={o.product} option={o} stock={stock} />
        ))}
      </ul>
      {usable.length === 0 && <p className={css.ragwort}>Nothing we hold notes on may be used here. See “Without a sprayer” above, or ask a BASIS-qualified adviser.</p>}

      {ruledOut.length > 0 && (
        <>
          <h2 className={css.h2}>Not where horses graze</h2>
          <ul className={css.products}>
            {ruledOut.map((o) => (
              <Card key={o.product} option={o} stock={stock} out />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
