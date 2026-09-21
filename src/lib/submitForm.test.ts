import { describe, expect, it, vi } from 'vitest';
import { submitForm } from './submitForm';

/**
 * No jsdom here, so the form is a stub shaped like the parts this touches.
 * That is enough: the whole point of the function is which branch it takes.
 */
function fakeForm(opts: { hasRequestSubmit: boolean }) {
  const appended: FakeInput[] = [];
  const clicked: FakeInput[] = [];
  const removed: FakeInput[] = [];

  type FakeInput = {
    type: string;
    hidden: boolean;
    click: () => void;
    remove: () => void;
  };

  const form = {
    requestSubmit: opts.hasRequestSubmit ? vi.fn() : undefined,
    ownerDocument: {
      createElement: () => {
        const el: FakeInput = {
          type: '',
          hidden: false,
          click: () => clicked.push(el),
          remove: () => removed.push(el),
        };
        return el;
      },
    },
    appendChild: (el: FakeInput) => appended.push(el),
  };

  return { form, appended, clicked, removed };
}

describe('submitForm', () => {
  it('uses the native call where it exists', () => {
    const { form, appended } = fakeForm({ hasRequestSubmit: true });
    submitForm(form as unknown as HTMLFormElement);
    expect(form.requestSubmit).toHaveBeenCalledOnce();
    expect(appended).toHaveLength(0);
  });

  it('clicks a real submitter where it does not — iOS 15 and earlier', () => {
    const { form, appended, clicked } = fakeForm({ hasRequestSubmit: false });
    submitForm(form as unknown as HTMLFormElement);

    expect(appended).toHaveLength(1);
    expect(clicked).toHaveLength(1);
    // A submit button, not a plain one: it has to trigger validation and fire
    // the submit event the way a real press does.
    expect(appended[0].type).toBe('submit');
    expect(appended[0].hidden).toBe(true);
  });

  it('never leaves its submitter behind', () => {
    const { form, removed } = fakeForm({ hasRequestSubmit: false });
    submitForm(form as unknown as HTMLFormElement);
    expect(removed).toHaveLength(1);
  });

  it('cleans up even when the submit handler throws', () => {
    const { form, removed } = fakeForm({ hasRequestSubmit: false });
    form.ownerDocument.createElement = () => {
      const el = {
        type: '',
        hidden: false,
        click: () => {
          throw new Error('handler blew up');
        },
        remove: () => removed.push(el),
      };
      return el;
    };

    expect(() => submitForm(form as unknown as HTMLFormElement)).toThrow('handler blew up');
    expect(removed).toHaveLength(1);
  });

  it('does nothing when there is no form, rather than throwing', () => {
    expect(() => submitForm(null)).not.toThrow();
    expect(() => submitForm(undefined)).not.toThrow();
  });
});
