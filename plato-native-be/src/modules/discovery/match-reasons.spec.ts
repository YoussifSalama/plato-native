import { matchReasons } from './match-reasons';

describe('matchReasons', () => {
  const terms = [
    'ERP Consultant',
    'SAP',
    'Supply chain planning',
    'Node.js',
    'C++',
    'R',
  ];

  it('title matches first, then the description, at most three', () => {
    const job = {
      title: 'Senior ERP Consultant (SAP)',
      description: 'You will own supply chain planning and C++ tooling.',
    };
    expect(matchReasons(job, terms)).toEqual([
      'ERP Consultant',
      'SAP',
      'Supply chain planning',
    ]);
  });

  it('whole words only: "SAP" is not found inside "sapphire", single letters are ignored', () => {
    expect(
      matchReasons(
        { title: 'Sapphire engineer', description: 'R and more' },
        terms,
      ),
    ).toEqual([]);
  });

  it('terms with symbols do not break the pattern', () => {
    expect(
      matchReasons(
        { title: 'Node.js developer', description: 'C++ a plus' },
        terms,
      ),
    ).toEqual(['Node.js', 'C++']);
  });
});
