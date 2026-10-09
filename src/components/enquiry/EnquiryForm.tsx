'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { submitEnquiryAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { readFirstTouch, visitAttribution, type VisitAttribution } from '@/lib/firstTouch';
import { EmailField } from '@/components/forms/EmailField';
import { ServiceQuestions } from '@/app/(frontend)/start/ServiceQuestions';
import { hasAnswer, visibleChoices } from '@/lib/jobParse/conditions';
import { ENQUIRY_CATEGORIES, type EnquiryCategory } from '@/lib/enquiryCategories';
import f from '@/components/forms/forms.module.css';
import a from '@/app/(frontend)/auth.module.css';

/**
 * Reusable customer-enquiry form for new marketplace verticals (hay, tractor
 * hire). Posts to submitEnquiryAction, which files a lead + emails admins.
 *
 * It asks the vertical's own questions first (CONDITION_QUESTIONS — bales,
 * size, one-off or regular for hay), the same set and the same answers as
 * the /start flow, so a supplier gets a spec rather than a paragraph. The
 * free text stays: it is the customer's words, which the contractor reads.
 */
export function EnquiryForm({
  category,
  detailsLabel,
  detailsPlaceholder,
  submitLabel,
}: {
  category: EnquiryCategory;
  detailsLabel: string;
  detailsPlaceholder: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(submitEnquiryAction, emptyFormState);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // A required question (how many bales) asks once — the first Send without
  // it scrolls there; a second Send goes anyway. A blocked form loses the
  // lead, and a lead without a count is still a lead.
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const requiredAsked = useRef(false);
  const questions = visibleChoices(ENQUIRY_CATEGORIES[category].serviceName, answers);
  const [formTs, setFormTs] = useState('');
  useEffect(() => setFormTs(String(Date.now())), []);
  // Where they came from, carried onto the lead and the job it becomes —
  // without it every hay and tractor-hire job counted as unattributed.
  const [visit, setVisit] = useState<VisitAttribution | null>(null);
  useEffect(
    () =>
      setVisit(
        visitAttribution(
          new URLSearchParams(window.location.search),
          readFirstTouch(),
          document.referrer,
          window.location.host,
        ),
      ),
    [],
  );

  if (state.ok) {
    return (
      <div className={a.card}>
        <p className={f.success} style={{ fontSize: 16, margin: 0 }}>
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className={a.card}
      onSubmit={(e) => {
        const unanswered = questions.find((q) => q.required && !hasAnswer(q, answers[q.key]));
        if (unanswered && !requiredAsked.current) {
          e.preventDefault();
          requiredAsked.current = true;
          setAskedFor(unanswered.key);
          document.getElementById(`q-${unanswered.key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }}
    >
      {state.error && <p className={f.error}>{state.error}</p>}

      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="form_ts" value={formTs} />
      <input type="hidden" name="utm_source" value={visit?.source ?? ''} />
      <input type="hidden" name="utm_medium" value={visit?.medium ?? ''} />
      <input type="hidden" name="utm_campaign" value={visit?.campaign ?? ''} />
      <input type="hidden" name="gclid" value={visit?.gclid ?? ''} />
      <input type="hidden" name="referrer" value={visit?.referrer ?? ''} />
      {/* Honeypot — real users never see or fill this. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className={a.row2}>
        <label className={f.field}>
          <span className={f.label}>Your name</span>
          <input className={f.input} type="text" name="name" required autoComplete="name" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Phone</span>
          <input className={f.input} type="tel" name="phone" required autoComplete="tel" />
        </label>
        <EmailField name="email" required hint="We reply to this address." />
        <label className={f.field}>
          <span className={f.label}>Postcode</span>
          <input className={f.input} type="text" name="postcode" required autoComplete="postal-code" />
          <span className={f.hint}>So we can match you with someone nearby.</span>
        </label>
      </div>

      {questions.length > 0 && (
        <>
          <ServiceQuestions
            questions={questions}
            askedFor={askedFor && !questions.some((q) => q.key === askedFor && hasAnswer(q, answers[q.key])) ? askedFor : null}
            values={answers}
            onAnswer={(key, value) => setAnswers((prev) => ({ ...prev, [key]: value }))}
            quantity=""
            onQuantity={() => {}}
            quantityClassName={f.field}
          />
          {questions.map(
            (q) =>
              hasAnswer(q, answers[q.key]) && (
                <input key={q.key} type="hidden" name={`condition_${q.key}`} value={answers[q.key]} />
              ),
          )}
        </>
      )}

      <label className={f.field}>
        <span className={f.label}>{detailsLabel}</span>
        {/* With the questions above carrying the job, the words are extra;
            without them (tractor hire) they are the job and stay required. */}
        <textarea
          className={f.textarea}
          name="details"
          required={questions.length === 0}
          maxLength={800}
          placeholder={detailsPlaceholder}
        />
      </label>

      {/* Said before they send, not after. The enquiry becomes a job that
          contractors price (components/enquiry/actions.ts), and it used to say
          their name and number went straight to contractors to call them —
          true of the retired job board, not of this. What contractors see is
          the job; contact details go only to the one whose price they accept. */}
      <p className={f.hint} style={{ marginTop: 4 }}>
        Sending this puts your job to vetted contractors covering your county, who
        send prices to your job page. Your name, number and email go only to the
        contractor whose price you accept. See our{' '}
        <a href="/privacy">privacy policy</a>.
      </p>

      <div className={a.actions}>
        <button className={f.btnYellow} type="submit" disabled={pending}>
          {pending ? 'Sending…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
