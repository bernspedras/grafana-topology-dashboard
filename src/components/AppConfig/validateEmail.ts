/** Basic email format check — rejects obvious typos without being RFC-strict. */
export function isValidEmail(value: string): boolean {
  return /^.+@.+\..+$/.test(value);
}
