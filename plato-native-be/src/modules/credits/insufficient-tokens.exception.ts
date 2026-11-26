import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 402 with what the client needs to explain it: the balance and when it refills.
 * `freeGrant` set = the account waits for a confirmed email (code email_unverified).
 */
export class InsufficientTokensException extends HttpException {
  constructor(
    balance: number,
    resetsAt: Date,
    needed?: number,
    freeGrant?: number,
  ) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: freeGrant ? 'email_unverified' : 'insufficient_tokens',
        message: freeGrant
          ? `Confirm your email to get your ${freeGrant.toLocaleString('en-US')} free tokens`
          : 'You have run out of Plato tokens for this month.',
        balance: Math.round(balance * 10) / 10,
        resetsAt,
        ...(needed !== undefined && { needed: Math.ceil(needed) }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
