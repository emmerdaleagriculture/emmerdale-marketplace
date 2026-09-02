/**
 * Shared /start copy. Lives outside actions.ts because that file is a
 * 'use server' module and can only export async functions.
 *
 * Approved wording. No timescale promised — must hold for uncovered counties
 * (spec §9) — and none of the banned commercial vocabulary anywhere (§10).
 */
export const CONFIRM_SUCCESS =
  'Thanks — we’ve got everything we need. Your job will be passed to contractors who cover your area, and we’ll be in touch.';

/** Where a confirmed job lands: a distinct URL so ad platforms can count it. */
export const START_COMPLETE_PATH = '/start/complete';
