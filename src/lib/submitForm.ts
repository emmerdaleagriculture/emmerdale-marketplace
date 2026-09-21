/**
 * Submit a form from code, on browsers that cannot.
 *
 * `HTMLFormElement.requestSubmit` is the correct way to do this — it runs
 * constraint validation and fires a real `submit` event, which is what React
 * and a server action are both listening for. Safari only shipped it in
 * version 16 (September 2022), so on iOS 15 and earlier the call throws
 * `TypeError: e.requestSubmit is not a function` and the submit simply never
 * happens.
 *
 * That is not a cosmetic failure on /start. Both automatic submits there go
 * through this: the one that fires when the security challenge finishes while
 * the customer waits, and the eight-second escape hatch written so that a slow
 * challenge never becomes a dead end. On an old iPhone the escape hatch is
 * itself what breaks, and the customer is left looking at a button that did
 * nothing. Sentry caught one on 21 September 2026, the first real error it saw
 * after its read path was repaired.
 *
 * The fallback is a hidden submit button rather than `form.submit()`, which
 * looks like the obvious substitute and is the wrong one: `submit()` skips
 * validation AND fires no `submit` event, so React never runs the handler and
 * the browser posts the raw form over the top of the app. Clicking a submitter
 * the form owns reproduces what `requestSubmit` does — validation, the event,
 * and the same handler — because it is the same path a real button takes.
 */
export function submitForm(form: HTMLFormElement | null | undefined): void {
  if (!form) return;

  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return;
  }

  const submitter = form.ownerDocument.createElement('input');
  submitter.type = 'submit';
  submitter.hidden = true;
  form.appendChild(submitter);
  try {
    submitter.click();
  } finally {
    // In a finally because a handler that throws must not leave a stray
    // submit button in the form, where it would be focusable and would make
    // the next Enter keypress do something the page never intended.
    submitter.remove();
  }
}
