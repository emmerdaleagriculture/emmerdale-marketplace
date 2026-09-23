import { describe, expect, it } from 'vitest';
import {
  conditionAnswers,
  conditionsFor,
  describeConditions,
  isAreaPriced,
  quantityFor,
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
