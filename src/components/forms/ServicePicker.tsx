'use client';

import { useState } from 'react';
import styles from './forms.module.css';

export type ServiceOption = { id: number; name: string };

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

  function toggle(id: number) {
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.chips}>
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
