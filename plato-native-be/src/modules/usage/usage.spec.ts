import { PrismaService } from '../prisma/prisma.service';
import { metered } from './usage';

it('metered sums tokens across raw responses and records one row', () => {
  const create = jest.fn().mockReturnValue(Promise.resolve());
  PrismaService.instance = { usageEvent: { create } } as never;
  const result = {
    rawResponses: [
      { usage: { inputTokens: 100, outputTokens: 10 } },
      { usage: { inputTokens: 50, outputTokens: 5 } },
    ],
  };
  expect(metered('t', 'm', result)).toBe(result);
  expect(create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      feature: 't',
      model: 'm',
      input_tokens: 150,
      output_tokens: 15,
      user_id: null,
    }),
  });
});
