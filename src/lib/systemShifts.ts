// System shift codes — protected from deletion and from `isWork`/`isHazardous`
// edits because the auto-scheduler, leave system, comp-day rotation, and
// after-day passes all key off these specific codes. Renaming or repurposing
// any of them silently breaks several layers of the app.
//
//   OFF — non-work routine rest day
//   CP  — non-work compensation rest day (Art. 74 comp-day grant)
//   AL  — annual leave
//   SL  — sick leave
//   MAT — maternity leave
//   PH  — public holiday off (paid non-work)
export const SYSTEM_SHIFT_CODES = new Set(['OFF', 'AL', 'SL', 'MAT', 'PH', 'CP']);

export const isSystemShift = (code: string): boolean => SYSTEM_SHIFT_CODES.has(code);
