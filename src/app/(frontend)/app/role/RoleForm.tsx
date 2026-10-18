'use client';

import { useActionState, useState } from 'react';
import Image from 'next/image';
import { chooseRoleAction } from './actions';
import { emptyFormState } from '@/lib/form';
import f from '@/components/forms/forms.module.css';
import ui from '../app-ui.module.css';
import s from './role.module.css';

type Role = 'customer' | 'contractor';

const OPTIONS: { value: Role; title: string; blurb: string; img: string }[] = [
  {
    value: 'customer',
    title: 'I need work done',
    blurb: 'Topping, mowing, hedges, fencing and more, on your own land.',
    img: '/woolton-house.jpg',
  },
  {
    value: 'contractor',
    title: 'I’m a contractor',
    blurb: 'Get local jobs, send prices and get paid through the app.',
    img: '/john-deere-6130r.jpg',
  },
];

export function RoleForm({ initial }: { initial: Role | null }) {
  const [state, action, pending] = useActionState(chooseRoleAction, emptyFormState);
  const [role, setRole] = useState<Role | null>(initial);

  return (
    <form action={action}>
      {state.error && <p className={f.error}>{state.error}</p>}
      <div className={s.options}>
        {OPTIONS.map((o) => (
          <label key={o.value} className={`${s.option} ${role === o.value ? s.optionOn : ''}`}>
            <input
              type="radio"
              name="role"
              value={o.value}
              checked={role === o.value}
              onChange={() => setRole(o.value)}
              className="sr-only"
            />
            <span className={s.img}>
              <Image src={o.img} alt="" width={64} height={64} className={s.imgEl} />
            </span>
            <span>
              <b>{o.title}</b>
              <span className={s.blurb}>{o.blurb}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="appFooterCta">
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={pending || !role}>
          {pending ? 'One moment…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}
