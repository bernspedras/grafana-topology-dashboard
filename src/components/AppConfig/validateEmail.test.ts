import { isValidEmail } from './validateEmail';

describe('isValidEmail', () => {
  it.each([
    'user@example.com',
    'admin@grafana.io',
    'user+tag@sub.domain.co',
    'name@localhost.localdomain',
  ])('accepts valid email: %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['plain word', 'hello'],
    ['missing domain', 'user@'],
    ['missing user', '@example.com'],
    ['no TLD dot', 'user@localhost'],
    ['multiple ats only', '@@@'],
    ['spaces only', '   '],
  ])('rejects invalid email: %s', (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});
