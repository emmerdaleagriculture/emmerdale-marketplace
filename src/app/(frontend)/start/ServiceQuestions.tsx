'use client';

import { toggleMulti, type ChoiceQuestion, type ConditionQuestion } from '@/lib/jobParse/conditions';
import f from '@/components/forms/forms.module.css';
import s from './start.module.css';

/**
 * A service's own questions (spec §26a.2), in the order its flow asks them.
 * Tap-to-answer throughout; options with a picture render as cards, so a
 * customer who doesn't know "closeboard" from "lap panel" can point at one.
 *
 * The quantity question is the one exception to tapping: it is the job's
 * area_value, the figure contractors price against, so it is a real number
 * field here and the generic area field is not shown alongside it.
 */
export function ServiceQuestions({
  questions,
  askedFor = null,
  values,
  onAnswer,
  quantity,
  onQuantity,
  quantityClassName,
}: {
  /** Already filtered to the questions the current answers leave showing. */
  questions: ConditionQuestion[];
  /** A required question the customer tried to send without answering. */
  askedFor?: string | null;
  values: Record<string, string>;
  onAnswer: (key: string, value: string) => void;
  quantity: string;
  onQuantity: (value: string) => void;
  quantityClassName: string;
}) {
  const tap = (q: ChoiceQuestion, value: string) => {
    if (q.multi) onAnswer(q.key, toggleMulti(q, values[q.key], value));
    // A second tap on the same answer clears it: none of these is required,
    // and a mis-tap should not be permanent.
    else onAnswer(q.key, values[q.key] === value ? '' : value);
  };
  const isOn = (q: ChoiceQuestion, value: string) =>
    q.multi ? (values[q.key] ?? '').split(',').includes(value) : values[q.key] === value;

  return (
    <>
      {questions.map((q) => (
        <div key={q.key} id={`q-${q.key}`}>
          {q.group && <p className={s.questionGroup}>{q.group}</p>}
          {q.kind === 'quantity' ? (
            <label className={quantityClassName}>
              <span className={f.label}>{q.label}</span>
              <input
                className={`${f.input} ${s.quantityInput}`}
                type="number"
                name="area_value"
                inputMode="decimal"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => onQuantity(e.target.value)}
              />
              <input type="hidden" name="area_unit" value={q.unit} />
              {q.hint && <span className={f.hint}>{q.hint}</span>}
            </label>
          ) : (
            <div className={f.field} role="group" aria-label={q.label}>
              <span className={f.label}>{q.label}</span>
              {q.hint && <span className={f.hint}>{q.hint}</span>}
              {askedFor === q.key && (
                <p className={s.discrepancy} role="alert" style={{ margin: '4px 0' }}>
                  The contractor needs this to price your job — tap any that apply, or{' '}
                  <strong>Not sure</strong>. Or press Send again to send it as it is.
                </p>
              )}
              {q.options.some((o) => o.image) ? (
                <div className={s.optionCards}>
                  {q.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={isOn(q, o.value)}
                      className={isOn(q, o.value) ? `${s.optionCard} ${s.optionCardOn}` : s.optionCard}
                      onClick={() => tap(q, o.value)}
                    >
                      {o.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.image} alt="" className={s.optionImage} width={160} height={100} />
                      )}
                      <strong>{o.label}</strong>
                      {o.description && <span>{o.description}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={f.chips}>
                  {q.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={isOn(q, o.value)}
                      className={isOn(q, o.value) ? `${f.chip} ${f.chipOn}` : f.chip}
                      onClick={() => tap(q, o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
