import { BOOTSTRAPPED_ADMIN_EMAIL } from './firebase';

/** Staff must use a professional address on the company domain. */
export const STAFF_EMAIL_DOMAIN = 'alphalogistixgroup.com';

export function isProfessionalEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(e) && e.endsWith(`@${STAFF_EMAIL_DOMAIN}`);
}

/** Professional address, or the bootstrapped main administrator (the only exception). */
export function isAllowedStaffEmail(email: string): boolean {
  return isProfessionalEmail(email) || email.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
}
