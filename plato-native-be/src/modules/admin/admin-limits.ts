import { RateLimiter } from '../extension/extension-token';

// Admin auth rate limits, by IP and by email (in memory, per process, like the
// seeker's). Named: they register in rateLimiters, where the admin panel lists and clears them.
export const adminSignupLimiter = new RateLimiter('admin-signup');
export const adminLoginLimiter = new RateLimiter('admin-login');
export const adminTotpLimiter = new RateLimiter('admin-totp');
export const adminSuperResetLimiter = new RateLimiter('admin-super-reset');
