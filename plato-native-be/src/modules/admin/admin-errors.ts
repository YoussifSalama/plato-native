import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';

// Owner's rule: one answer for every auth failure. It never says whether the
// email exists, the password was wrong, or an invitation exists.
export const GENERIC_AUTH_MESSAGE =
  'Something went wrong. Check your details and try again.';

export const genericAuthError = () =>
  new UnauthorizedException(GENERIC_AUTH_MESSAGE);

// Only after the password is proven.
export const inactiveError = () =>
  new ForbiddenException({
    statusCode: 403,
    code: 'INACTIVE',
    message: 'Your account is not active yet. Ask an admin to activate it.',
  });

export const tooManyAttempts = () =>
  new HttpException(
    'Too many attempts. Wait a few minutes and try again.',
    HttpStatus.TOO_MANY_REQUESTS,
  );
