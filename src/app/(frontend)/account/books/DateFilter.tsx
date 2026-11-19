import f from '@/components/forms/forms.module.css';
import s from './books.module.css';

/** A GET form for from/to dates; plain HTML, no client JS. */
export function DateFilter({ from, to, extra }: { from?: string | null; to?: string | null; extra?: Record<string, string> }) {
  return (
    <form className={s.filters} method="get">
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label>
        From
        <input className={f.input} type="date" name="from" defaultValue={from ?? ''} />
      </label>
      <label>
        To
        <input className={f.input} type="date" name="to" defaultValue={to ?? ''} />
      </label>
      <button className={f.btnGhost} type="submit">
        Show
      </button>
    </form>
  );
}
