'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './forms.module.css';

export type ServiceOption = {
  id: number;
  name: string;
  /**
   * Whether it belongs on a customer-facing service strip. A service can be
   * routable without being advertised (services.listed). The PICKER ignores
   * this on purpose — a contractor has to be able to tick anything they can
   * be sent.
   */
  listed?: boolean;
};

/**
 * Service multi-select rendered as toggle chips. Values submit as native
 * checkboxes named `service_ids` (read via formData.getAll('service_ids')).
 */
export function ServicePicker({
  services,
  selected = [],
}: {
  services: ServiceOption[];
  selected?: number[];
}) {
  const [on, setOn] = useState<Set<number>>(new Set(selected));
  const rootRef = useRef<HTMLDivElement>(null);

  // React 19 resets a form after its action returns, which puts every
  // checkbox back to its default (unticked unless `selected`) while `on`
  // still shows the chips ticked. Re-render once the reset is done so the
  // boxes match the chips again: what is submitted is what is shown.
  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form) return;
    const resync = () => setTimeout(() => setOn((prev) => new Set(prev)), 0);
    form.addEventListener('reset', resync);
    return () => form.removeEventListener('reset', resync);
  }, []);

  function toggle(id: number) {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.chips} ref={rootRef}>
      {services.map((s) => (
        <label
          key={s.id}
          className={`${styles.chip} ${on.has(s.id) ? styles.chipOn : ''}`.trim()}
        >
          <input
            type="checkbox"
            name="service_ids"
            value={s.id}
            checked={on.has(s.id)}
            onChange={() => toggle(s.id)}
          />
          {s.name}
        </label>
      ))}
    </div>
  );
}
