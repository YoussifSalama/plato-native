import { describe, expect, it } from 'vitest';
import { actionLabel } from './AuditLog';

describe('audit action labels', () => {
  it.each([
    ['POST /admin/users/:id/block', 'Blocked a user'],
    ['POST /admin/credits/:user/adjust', 'Adjusted a user’s tokens'],
    ['POST /admin/auth/totp/verify', 'Signed in'],
    ['PATCH /admin/roles/:id', 'Edited a role'],
    ['POST /admin/something/new', 'POST /admin/something/new'],
  ])('%s', (route, label) => expect(actionLabel(route)).toBe(label));
});
