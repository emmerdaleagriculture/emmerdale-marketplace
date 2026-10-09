import { describe, expect, it } from 'vitest';
import {
  conditionAnswers,
  conditionsFor,
  describeConditions,
  hasAnswer,
  isAreaPriced,
  quantityFor,
  requiredAnswered,
  toggleMulti,
  visibleChoices,
  type ChoiceQuestion,
} from './conditions';

const form = (fields: Record<string, string>) => (name: string) => fields[name];
const gates = conditionsFor('Fencing').find((q) => q.key === 'gates') as ChoiceQuestion;

describe('fencing flow', () => {
  it('asks its metres as the job quantity, in metres', () => {
    expect(quantityFor('Fencing')).toMatchObject({ unit: 'linear_m' });
    expect(quantityFor('Paddock topping')).toBeNull();
  });

  it('is priced by the metre, so never asks for a boundary', () => {
    expect(isAreaPriced('Fencing')).toBe(false);
    expect(isAreaPriced('Ditch clearance')).toBe(false);
    expect(isAreaPriced('Paddock topping')).toBe(true);
  });

  it('only asks about a capping rail on boarded fences', () => {
    const keys = (a: Record<string, string>) => visibleChoices('Fencing', a).map((q) => q.key);
    expect(keys({})).toContain('capping');
    expect(keys({ fence_type: 'closeboard' })).toContain('capping');
    expect(keys({ fence_type: 'post_and_rail' })).not.toContain('capping');
  });

  it('keeps valid answers and drops the rest', () => {
    const out = conditionAnswers(
      'Fencing',
      form({
        condition_fence_type: 'lap_panels',
        condition_height: '6ft',
        condition_posts: 'granite',
        condition_capping: 'yes',
        condition_gates: 'field,pedestrian',
        condition_slope: 'no',
      }),
    );
    expect(out).toEqual({
      fence_type: 'lap_panels',
      height: '6ft',
      capping: 'yes',
      gates: 'pedestrian,field', // option order, whatever order was sent
      slope: 'no',
    });
  });

  it('drops an answer to a question the fence type hides', () => {
    const out = conditionAnswers(
      'Fencing',
      form({ condition_fence_type: 'post_and_rail', condition_capping: 'yes' }),
    );
    expect(out).toEqual({ fence_type: 'post_and_rail' });
  });

  it('refuses "no gates" alongside a gate', () => {
    expect(conditionAnswers('Fencing', form({ condition_gates: 'none,field' }))).toEqual({});
  });
});

describe('weed question', () => {
  it('is asked, and required, for both weed control and spraying', () => {
    for (const svc of ['Weed control', 'Spraying']) {
      const q = visibleChoices(svc, {}).find((x) => x.key === 'weeds') as ChoiceQuestion;
      expect(q?.required).toBe(true);
      expect(q?.multi).toBe(true);
    }
  });

  it('keeps several weeds, and not-sure only on its own', () => {
    expect(conditionAnswers('Spraying', form({ condition_weeds: 'docks,ragwort' }))).toEqual({
      weeds: 'ragwort,docks',
    });
    expect(conditionAnswers('Spraying', form({ condition_weeds: 'not_sure,docks' }))).toEqual({});
  });

  it('reads back for the contractor in words', () => {
    expect(describeConditions('Weed control', { weeds: 'ragwort,bracken' })).toEqual([
      ['Weeds', 'Ragwort, Bracken'],
    ]);
  });
});

describe('hedge cutting flow', () => {
  it('asks its length as the job quantity, in metres, and never for a boundary', () => {
    expect(quantityFor('Hedge cutting')).toMatchObject({ unit: 'linear_m' });
    expect(isAreaPriced('Hedge cutting')).toBe(false);
  });

  it('asks the height, and requires which parts need cutting', () => {
    const qs = visibleChoices('Hedge cutting', {});
    expect(qs.map((q) => q.key)).toEqual(['hedge_height', 'hedge_sides']);
    expect(qs.find((q) => q.key === 'hedge_sides')?.required).toBe(true);
  });

  it('keeps both sides and the top, and not-sure only on its own', () => {
    expect(
      conditionAnswers(
        'Hedge cutting',
        form({ condition_hedge_height: '6_10ft', condition_hedge_sides: 'top,far_side,my_side' }),
      ),
    ).toEqual({ hedge_height: '6_10ft', hedge_sides: 'my_side,far_side,top' });
    expect(
      conditionAnswers('Hedge cutting', form({ condition_hedge_sides: 'not_sure,top' })),
    ).toEqual({});
  });

  it('reads back for the contractor in words', () => {
    expect(
      describeConditions('Hedge cutting', { hedge_sides: 'my_side,top', hedge_height: 'over_10ft' }),
    ).toEqual([
      ['Height', 'Over 10ft'],
      ['Cutting', 'My side, The top'],
    ]);
  });
});

describe('toggleMulti', () => {
  it('adds and removes', () => {
    expect(toggleMulti(gates, '', 'field')).toBe('field');
    expect(toggleMulti(gates, 'field', 'pedestrian')).toBe('pedestrian,field');
    expect(toggleMulti(gates, 'pedestrian,field', 'field')).toBe('pedestrian');
  });

  it('lets "no gates" and a gate replace each other', () => {
    expect(toggleMulti(gates, 'pedestrian,field', 'none')).toBe('none');
    expect(toggleMulti(gates, 'none', 'driveway')).toBe('driveway');
  });
});

describe('describeConditions', () => {
  it('reads answers back in the words they were asked in', () => {
    expect(
      describeConditions('Fencing', { fence_type: 'closeboard_panels', gates: 'pedestrian,field' }),
    ).toEqual([
      ['Fence type', 'Closeboard panels'],
      ['Gates', 'Pedestrian (about 3–4ft), Field gate (about 12ft)'],
    ]);
  });

  it('lists answers in the order they were asked, whatever order they were stored in', () => {
    const stored = { gates: 'none', posts: 'wooden', height: '4ft', fence_type: 'picket' };
    expect(describeConditions('Fencing', stored).map(([label]) => label)).toEqual([
      'Fence type',
      'Height',
      'Posts',
      'Gates',
    ]);
  });

  it('keeps keys it does not know rather than hiding them', () => {
    expect(describeConditions(null, { soil_type: 'heavy_clay' })).toEqual([
      ['soil type', 'heavy clay'],
    ]);
  });
});

describe('hay, straw & haylage flow', () => {
  const hay = 'Hay, straw & haylage';

  it('asks what, how many, what size, delivery and whether it repeats — by the bale, not the acre', () => {
    expect(visibleChoices(hay, {}).map((q) => q.key)).toEqual([
      'forage',
      'bale_count',
      'bale_size',
      'delivery',
      'order',
    ]);
    expect(quantityFor(hay)).toBeNull();
    expect(isAreaPriced(hay)).toBe(false);
  });

  it('asks how often only for a regular order', () => {
    const keys = (a: Record<string, string>) => visibleChoices(hay, a).map((q) => q.key);
    expect(keys({ order: 'regular' })).toContain('frequency');
    expect(keys({ order: 'one_off' })).not.toContain('frequency');
    expect(keys({})).not.toContain('frequency');
  });

  it('keeps a bale count only when it is a positive whole number', () => {
    expect(conditionAnswers(hay, form({ condition_bale_count: '20' }))).toEqual({ bale_count: '20' });
    expect(conditionAnswers(hay, form({ condition_bale_count: ' 1,000 ' }))).toEqual({ bale_count: '1000' });
    expect(conditionAnswers(hay, form({ condition_bale_count: '2.6' }))).toEqual({ bale_count: '3' });
    expect(conditionAnswers(hay, form({ condition_bale_count: '0' }))).toEqual({});
    expect(conditionAnswers(hay, form({ condition_bale_count: '0.3' }))).toEqual({});
    expect(conditionAnswers(hay, form({ condition_bale_count: 'twenty' }))).toEqual({});
  });

  it('counts an answer the way the server will keep it, so "0" bales is still asked about', () => {
    const count = visibleChoices(hay, {}).find((q) => q.key === 'bale_count')!;
    const size = visibleChoices(hay, {}).find((q) => q.key === 'bale_size')!;
    expect(hasAnswer(count, '20')).toBe(true);
    expect(hasAnswer(count, '0')).toBe(false);
    expect(hasAnswer(count, undefined)).toBe(false);
    expect(hasAnswer(size, 'round')).toBe(true);
    expect(hasAnswer(size, 'enormous')).toBe(false);
  });

  it('is complete only when every required question has a real answer', () => {
    const full = { forage: 'hay', bale_count: '20', bale_size: 'small', order: 'one_off' };
    expect(requiredAnswered(hay, full)).toBe(true);
    expect(requiredAnswered(hay, { ...full, bale_count: '0' })).toBe(false);
    expect(requiredAnswered(hay, { delivery: 'either' })).toBe(false);
    // A regular order's frequency is optional, so its absence does not block.
    expect(requiredAnswered(hay, { ...full, order: 'regular' })).toBe(true);
    // A service with no required questions is never "complete" on answers alone.
    expect(requiredAnswered('Tractor hire (events)', {})).toBe(false);
  });

  it('drops a frequency given for a one-off', () => {
    expect(
      conditionAnswers(hay, form({ condition_order: 'one_off', condition_frequency: 'weekly' })),
    ).toEqual({ order: 'one_off' });
    expect(
      conditionAnswers(hay, form({ condition_order: 'regular', condition_frequency: 'fortnightly' })),
    ).toEqual({ order: 'regular', frequency: 'fortnightly' });
  });

  it('reads back as a spec a supplier can price from', () => {
    expect(
      describeConditions(hay, {
        forage: 'hay,straw',
        bale_count: '20',
        bale_size: 'small',
        delivery: 'delivered',
        order: 'regular',
        frequency: 'fortnightly',
      }),
    ).toEqual([
      ['Forage', 'Hay, Straw'],
      ['Bales', '20'],
      ['Bale size', 'Small (conventional)'],
      ['Delivery', 'Delivered'],
      ['Order', 'Regular order'],
      ['How often', 'Every 2 weeks'],
    ]);
  });
});
