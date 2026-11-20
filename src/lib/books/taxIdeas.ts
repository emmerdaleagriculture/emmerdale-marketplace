import { gbp, isCompany, type TaxInput } from './taxPointers';

/**
 * Ideas worth checking (2026-11-20): the common, legitimate ways a small
 * business pays less tax, shown whatever is in the books. The pointers
 * react to what has been posted; these suggest what could be. Each is
 * marked "already in your books" when matching spending is there, so the
 * list doesn't nag. Figures come from the year's rates (taxRates.ts).
 */
export type Idea = {
  key: string;
  title: string;
  why: string;
  todo?: string;
  /** Spending in the books that suggests this is already being done. */
  inUse?: string;
  link: { label: string; href: string };
};

export function ideas(inp: TaxInput): Idea[] {
  const { rates: r, profile, period: p } = inp;
  const company = isCompany(profile.structure);
  const balanceOf = (code: string) => inp.tb.filter((t) => t.code === code).reduce((n, t) => n + t.debit_pence - t.credit_pence, 0);
  const said = (re: RegExp) => inp.expenseLines.filter((l) => re.test(l.text));
  const inUse = (label: string, amount: number) => (amount > 0 ? `${gbp(amount)} on ${label} in ${p.from.slice(0, 4)}-${p.to.slice(2, 4)}` : undefined);
  const total = (ls: { amount: number }[]) => ls.reduce((n, l) => n + l.amount, 0);
  const out: Idea[] = [];
  const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

  // Gifts to staff (trivial benefits), vouchers included.
  out.push({
    key: 'trivial-benefits',
    title: 'Small gifts to staff, vouchers included',
    why: `A gift to an employee that costs ${gbp(r.trivialBenefit)} or less, isn’t cash or a cash voucher, and isn’t a reward for their work is tax-free for them and deductible for you: a birthday or Christmas gift, flowers, a store gift card.${
      company ? ` As a director of a company with five or fewer shareholders you can have them too, up to ${gbp(r.trivialDirectorCap)} a year in total.` : ' They’re for employees: as a sole trader or partner you can’t give them to yourself.'
    }`,
    todo: 'Keep each gift under the limit and record it to Staff welfare, with who it was for.',
    inUse: inUse('staff welfare', balanceOf('6970')),
    link: { label: 'Trivial benefits', href: 'https://www.gov.uk/expenses-and-benefits-trivial-benefits' },
  });

  // Christmas dinner or a summer do.
  const party = said(/\b(christmas|xmas|party|staff (dinner|meal|do|night)|summer do)\b/i);
  out.push({
    key: 'staff-party',
    title: 'A yearly staff do, like a Christmas dinner',
    why: `An annual event open to all your staff, up to ${gbp(r.staffPartyPerHead)} a head including VAT, transport and any overnight stay, is tax-free for them and deductible for the business. Partners and family who come count as heads too.${
      company ? ' As a director you count as staff.' : ' On your own, with no employees, a meal out isn’t a business cost.'
    }`,
    todo: 'Book it as one event for everyone, keep it under the limit a head, and record it to Staff welfare (not Entertainment).',
    inUse: inUse('staff events', total(party)),
    link: { label: 'Social functions', href: 'https://www.gov.uk/expenses-and-benefits-social-functions' },
  });

  // Employing family.
  const wages = said(/\b(wages?|salary|salaries|payroll|paye)\b/i);
  out.push({
    key: 'family',
    title: 'Paying family who help with the work',
    why: `If your partner, husband or wife, or children help (answering the phone, invoicing, on the machines), paying them is a business cost. Someone with no other income pays no income tax up to ${gbp(r.personalAllowance)} a year, so pay that would be taxed at your rate can be taxed at theirs. It has to be for real work, at a fair rate for it (at least ${pounds(r.livingWage)} an hour for over-21s who are workers), and actually paid to them.${
      company ? ` A company whose only paid employee is the director can’t claim the ${gbp(r.employmentAllowance)} Employment Allowance off employer National Insurance; a second employee paid over ${gbp(r.employerNi.threshold)} a year, such as family, can make it claimable.` : ''
    }`,
    todo: 'Keep a note of what they do and their hours, pay into their own account, and run it through payroll. Under-16s have limits on when and how long they can work.',
    inUse: inUse('wages', total(wages)),
    link: { label: 'Employing staff for the first time', href: 'https://www.gov.uk/employing-staff' },
  });

  // Gifts to customers.
  out.push({
    key: 'customer-gifts',
    title: 'Gifts to customers',
    why: `Gifts to customers are only deductible if they carry your business name or logo and come to no more than ${gbp(5_000)} per person in the year. Food, drink (a Christmas bottle or hamper) and vouchers (an Amazon voucher) never are, whatever they cost.`,
    todo: 'Branded calendars, diaries or caps under the limit are fine. Record food, drink and vouchers for customers to Entertainment.',
    link: { label: 'Business gifts', href: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim45070' },
  });

  // Phone.
  out.push({
    key: 'phone',
    title: company ? 'A mobile phone through the company' : 'Your phone and broadband',
    why: company
      ? 'The company can provide one mobile phone and its contract to each employee, you included, with no tax for you. The contract must be in the company’s name.'
      : 'The business share of your mobile and home broadband counts: all of a phone used only for work, or a fair share of a mixed one.',
    todo: company ? 'Put the contract in the company’s name, then record the bills to Telephone & internet.' : 'Record the business share to Telephone & internet.',
    inUse: inUse('telephone', balanceOf('6400')),
    link: company
      ? { label: 'Mobile phones', href: 'https://www.gov.uk/expenses-and-benefits-mobile-phones' }
      : { label: 'Office, property and equipment', href: 'https://www.gov.uk/expenses-if-youre-self-employed/office-property-and-equipment' },
  });

  // Workwear.
  const kit = said(/\b(boots?|ppe|hi-?vis|overalls?|waterproofs?|gloves|chainsaw (trousers|helmet)|ear defenders|safety|workwear|uniform)\b/i);
  out.push({
    key: 'workwear',
    title: 'Protective clothing and workwear',
    why: 'Safety boots, chainsaw trousers, hi-vis, gloves, ear defenders and branded workwear are business costs. Everyday clothes aren’t, even if you only wear them for work.',
    todo: 'Record them to Repairs & maintenance or General expenses, describing what they are.',
    inUse: inUse('workwear', total(kit)),
    link: { label: 'Clothing expenses', href: 'https://www.gov.uk/expenses-if-youre-self-employed/clothing' },
  });

  // Training.
  out.push({
    key: 'training',
    title: 'Training and tickets',
    why: company
      ? 'Courses and tickets the company pays for, such as spraying (PA1, PA6), chainsaw or first aid, are deductible and tax-free for you when they’re for the work.'
      : 'Courses that keep up or update the skills you already use, such as spraying (PA1, PA6), chainsaw or first aid, are business costs. Training for a new line of work isn’t.',
    todo: 'Record them to Training.',
    inUse: inUse('training', balanceOf('6950')),
    link: { label: 'Training courses', href: 'https://www.gov.uk/expenses-if-youre-self-employed/training-courses' },
  });

  if (company) {
    out.push({
      key: 'eye-tests',
      title: 'Eye tests for screen users',
      why: 'If you or your staff use a screen for work (quoting, invoicing, the books), the company can pay for eye tests, and glasses needed for screen work, with no tax.',
      todo: 'Record them to Staff welfare.',
      link: { label: 'Eye tests and glasses', href: 'https://www.gov.uk/expenses-and-benefits-eye-tests' },
    });
    out.push({
      key: 'electric-car',
      title: 'An electric car through the company',
      why: `A fully electric company car is taxed on you at only ${Math.round(r.electricCarBenefit * 100)}% of its list price a year, against up to 37% for petrol and diesel, and new zero-emission cars have had a 100% first-year allowance, so the company deducts the cost in the year it buys one (check it still applies when you buy). Charging it at work is tax-free too.`,
      todo: 'Ask your accountant to compare it with using your own car and claiming mileage.',
      link: { label: 'Company cars', href: 'https://www.gov.uk/tax-company-benefits/tax-on-company-cars' },
    });
  }

  return out;
}
