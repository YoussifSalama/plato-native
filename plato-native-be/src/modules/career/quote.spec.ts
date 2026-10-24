import { saidBySeeker } from './quote';

describe('saidBySeeker', () => {
  const said = [
    'i have experience with maria db and postgresql',
    'take a look here https://github.com/x',
  ];
  it('accepts a quote that is really in the seeker messages, ignoring case and spacing', () => {
    expect(saidBySeeker(said, 'Maria  DB and PostgreSQL')).toBe(true);
  });
  it('rejects anything the seeker never said', () => {
    expect(
      saidBySeeker(said, 'built a React portfolio used by 2000 people'),
    ).toBe(false);
    expect(saidBySeeker(said, 'git')).toBe(false); // too short to count
  });
});
