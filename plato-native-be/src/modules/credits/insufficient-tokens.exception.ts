import { HttpException, HttpStatus } from '@nestjs/common';

/** 402 with what the client needs to explain it: the balance and when it refills. */
export class InsufficientTokensException extends HttpException {
  constructor(balance: number, resetsAt: Date, needed?: number) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'insufficient_tokens',
        message: 'You have run out of Plato tokens for this month.',
        balance: Math.round(balance * 10) / 10,
        resetsAt,
        ...(needed !== undefined && { needed: Math.ceil(needed) }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
