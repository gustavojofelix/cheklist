import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** NUIT — exactly 9 digits (empty allowed; combine with required when needed). */
export const nuit: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || /^[0-9]{9}$/.test(String(c.value)) ? null : { nuit: true };

/** Mozambican phone — 9 digits. */
export const phone9: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || /^[0-9]{9}$/.test(String(c.value)) ? null : { phone: true };

export const sameAs = (other: string): ValidatorFn => (c: AbstractControl) =>
  c.parent && c.value !== c.parent.get(other)?.value ? { mismatch: true } : null;

/** First error of a control as an i18n key. */
export function errorOf(c: AbstractControl | null): string | null {
  if (!c || !c.errors || !(c.touched || c.dirty)) return null;
  const e = c.errors;
  if (e['required'] || e['requiredTrue']) return 'validation.required';
  if (e['email']) return 'validation.email';
  if (e['nuit']) return 'validation.nuit';
  if (e['phone']) return 'validation.phone';
  if (e['minlength']) return 'validation.minlength';
  if (e['mismatch']) return 'validation.mismatch';
  if (e['min'] || e['max']) return 'validation.range';
  return 'validation.invalid';
}
