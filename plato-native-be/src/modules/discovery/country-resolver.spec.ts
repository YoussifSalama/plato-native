import { resolvePlaces } from './country-resolver';

describe('resolvePlaces', () => {
  it('uses the rules first and only asks the model about the rest', async () => {
    const ask = jest.fn().mockResolvedValue([
      { place: 'Kitchener', country: 'ca' },
      { place: 'Nowhereville', country: null },
    ]);
    const out = await resolvePlaces(
      ['Toronto, Canada', 'Kitchener', 'Nowhereville'],
      'model',
      ask,
    );
    expect(ask).toHaveBeenCalledWith('model', ['Kitchener', 'Nowhereville']);
    expect(out.get('Toronto, Canada')).toBe('CA');
    expect(out.get('Kitchener')).toBe('CA');
    expect(out.has('Nowhereville')).toBe(false);
  });

  it('remembers answers, including "unknown"', async () => {
    const ask = jest
      .fn()
      .mockResolvedValue([{ place: 'Zzyzx', country: null }]);
    await resolvePlaces(['Zzyzx'], 'model', ask);
    await resolvePlaces(['Zzyzx'], 'model', ask);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('rejects made-up codes and survives a failing model', async () => {
    const bad = jest.fn().mockResolvedValue([{ place: 'Foo', country: 'QQ' }]);
    expect((await resolvePlaces(['Foo'], 'm', bad)).has('Foo')).toBe(false);
    const down = jest.fn().mockRejectedValue(new Error('boom'));
    expect((await resolvePlaces(['Bar'], 'm', down)).size).toBe(0);
  });
});
