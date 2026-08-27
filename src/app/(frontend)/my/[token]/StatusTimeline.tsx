import m from './my.module.css';

const STEPS: [string, string][] = [
  ['distributed', 'Sent to contractors'],
  ['quotes_receiving', 'Prices coming in'],
  ['accepted_awaiting_payment', 'Payment'],
  ['awarded', 'Booked'],
  ['completed', 'Done'],
];

const ORDER: Record<string, number> = {
  confirmed: 0,
  distributed: 0,
  quotes_receiving: 1,
  accepted_awaiting_payment: 2,
  awarded: 3,
  contacted: 3,
  scheduled: 3,
  in_progress: 3,
  completed_by_contractor: 3,
  completed: 4,
  paid: 4,
};

export function StatusTimeline({ status }: { status: string }) {
  const position = ORDER[status] ?? -1;
  if (position < 0) return null;
  return (
    <ol className={m.timeline}>
      {STEPS.map(([, label], i) => (
        <li
          key={label}
          className={
            i < position ? m.stepDone : i === position ? m.stepCurrent : m.stepFuture
          }
        >
          {label}
        </li>
      ))}
    </ol>
  );
}
