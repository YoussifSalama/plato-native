import { describe, expect, it } from 'vitest';
import { profileFromCandidate } from '../src/core/profile';

describe('profileFromCandidate', () => {
  it('takes identity details only, drops empties, splits the city', () => {
    const p = profileFromCandidate({
      fullName: 'Youssif Salama', firstName: 'Youssif', lastName: 'Salama', email: 'y@example.com', phone: null,
      location: 'Cairo, Egypt', country: 'Egypt', currentCompany: '', links: { linkedin: 'https://linkedin.com/in/ys', github: null },
      // extra backend fields must never be picked up
      ...({ skills: ['x'], summary: 'bio', answerBank: { why: 'because' }, experiences: [] } as object),
    } as never);
    expect(p).toEqual({ firstName: 'Youssif', lastName: 'Salama', fullName: 'Youssif Salama', email: 'y@example.com', city: 'Cairo', country: 'Egypt', linkedin: 'https://linkedin.com/in/ys' });
  });
});
