'use client';

import { useActionState } from 'react';
import { updateProfileAction } from './actions';
import { emptyFormState } from '@/lib/form';
import { CountyPicker, type CountyOption } from '@/components/forms/CountyPicker';
import { ServicePicker, type ServiceOption } from '@/components/forms/ServicePicker';
import type { Contractor } from '@/lib/auth';
import f from '@/components/forms/forms.module.css';
import a from '../auth.module.css';
import ac from './account.module.css';

/**
 * Contractor settings, folded into sections so the dashboard above stays in
 * reach on a phone. Closed <details> still submit their inputs; if a required
 * field inside one is empty, the invalid event opens its section so the
 * browser can focus it instead of silently refusing to submit.
 */
export function AccountForm({
  contractor,
  counties,
  selectedCounties,
  services,
  listing = false,
}: {
  contractor: Contractor;
  counties: CountyOption[];
  selectedCounties: number[];
  services: ServiceOption[];
  /** An Open member: show the county-page listing's fields. */
  listing?: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, emptyFormState);
  const serviceCount = (contractor.services ?? []).length;

  return (
    <form
      action={action}
      onInvalidCapture={(e) => {
        const section = (e.target as HTMLElement).closest('details');
        if (section) section.open = true;
      }}
    >
      <details className={ac.section}>
        <summary className={ac.sectionHead}>
          Business details
          <span className={ac.sectionMeta}>{contractor.phone}</span>
        </summary>
        <div className={ac.sectionBody}>
          <div className={a.row2}>
            <label className={f.field}>
              <span className={f.label}>Business name</span>
              <input className={f.input} name="business_name" defaultValue={contractor.business_name} required />
            </label>
            <label className={f.field}>
              <span className={f.label}>Contact name</span>
              <input className={f.input} name="contact_name" defaultValue={contractor.contact_name} required />
            </label>
            <label className={f.field}>
              <span className={f.label}>Phone</span>
              <input className={f.input} name="phone" type="tel" defaultValue={contractor.phone} required />
            </label>
            <label className={f.field}>
              <span className={f.label}>Base postcode</span>
              <input className={f.input} name="base_postcode" defaultValue={contractor.base_postcode} required />
            </label>
          </div>
        </div>
      </details>

      <details className={ac.section}>
        <summary className={ac.sectionHead}>
          Work you do
          <span className={ac.sectionMeta}>
            {serviceCount} {serviceCount === 1 ? 'service' : 'services'}
          </span>
        </summary>
        <div className={ac.sectionBody}>
          <p className={f.hint} style={{ marginBottom: 12 }}>
            Fewer services means fewer irrelevant invitations — keep this accurate and
            you&rsquo;ll only hear about work you actually want.
          </p>
          <ServicePicker services={services} selected={contractor.services ?? []} />
        </div>
      </details>

      <details className={ac.section}>
        <summary className={ac.sectionHead}>
          Counties you cover
          <span className={ac.sectionMeta}>
            {selectedCounties.length} {selectedCounties.length === 1 ? 'county' : 'counties'}
          </span>
        </summary>
        <div className={ac.sectionBody}>
          <p className={f.hint} style={{ marginBottom: 12 }}>
            Changes take effect straight away: add a county and any jobs still open
            there are sent to you.
          </p>
          <CountyPicker counties={counties} selected={selectedCounties} collapsible />
        </div>
      </details>

      <details className={ac.section}>
        <summary className={ac.sectionHead}>
          Notifications
          <span className={ac.sectionMeta}>
            {contractor.notify_new_jobs ? 'Emails on' : 'Emails off'}
            {' · '}
            {contractor.notify_sms ? 'Texts on' : 'Texts off'}
          </span>
        </summary>
        <div className={ac.sectionBody}>
          <label className={f.checkRow}>
            <input type="checkbox" name="notify_new_jobs" defaultChecked={contractor.notify_new_jobs} />
            <span>Email me each new job to price in my counties, and a Monday round-up of what&rsquo;s still open.</span>
          </label>
          <p className={f.hint} style={{ marginTop: 8 }}>
            Turned off, new jobs still appear on this dashboard and under Jobs to
            price — you just won&rsquo;t be emailed about them.
          </p>
          <label className={f.checkRow} style={{ marginTop: 16 }}>
            <input type="checkbox" name="notify_sms" defaultChecked={contractor.notify_sms} />
            <span>Text me too: new jobs to price, jobs I&rsquo;ve won and messages from customers, to the phone number above.</span>
          </label>
          <p className={f.hint} style={{ marginTop: 8 }}>
            Texts go out between 8am and 9pm. You can also reply STOP to any of them.
          </p>
        </div>
      </details>

      {listing && (
        <details className={ac.section}>
          <summary className={ac.sectionHead}>
            Your listing
            <span className={ac.sectionMeta}>
              {!contractor.directory_listed ? 'Hidden' : contractor.vetted_at ? 'On the county pages' : 'Once vetted'}
            </span>
          </summary>
          <div className={ac.sectionBody}>
            <input type="hidden" name="directory_section" value="1" />
            <p className={f.hint}>
              As an Open member you’re named in Find a contractor and on our public pages for
              each county you cover, with a link to your website and a button customers use to
              write to you directly.
              {!contractor.vetted_at && ' The listing goes live once we’ve vetted your account.'}
            </p>
            <label className={f.checkRow} style={{ marginTop: 12 }}>
              <input type="checkbox" name="directory_listed" defaultChecked={contractor.directory_listed} />
              <span>List {contractor.business_name} on the county pages.</span>
            </label>
            <div className={a.row2} style={{ marginTop: 16 }}>
              <label className={f.field}>
                <span className={f.label}>Website</span>
                <input
                  className={f.input}
                  name="website"
                  type="text"
                  inputMode="url"
                  placeholder="www.example.co.uk"
                  defaultValue={contractor.website ?? ''}
                />
                <span className={f.hint}>Optional. Shown as a link on your listing.</span>
              </label>
              <label className={f.field}>
                <span className={f.label}>A line about you</span>
                <input
                  className={f.input}
                  name="directory_blurb"
                  maxLength={160}
                  placeholder="Family-run, 20 years in the Test Valley. Topping, harrowing and hedges."
                  defaultValue={contractor.directory_blurb ?? ''}
                />
                <span className={f.hint}>Up to 160 characters, under your name.</span>
              </label>
            </div>
          </div>
        </details>
      )}

      <div className={ac.formFoot}>
        {state.error && <p className={f.error}>{state.error}</p>}
        {state.ok && <p className={f.success}>{state.message}</p>}
        <button className={f.btnPrimary} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
