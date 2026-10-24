const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// A saved fact must be backed by the seeker's own words in this chat: the
// assistant has to quote them, and the quote has to be really there. This is
// what stops it saving things it "read" from a link or made up.
export function saidBySeeker(userMessages: string[], quote: string): boolean {
  const q = flat(quote);
  return q.length >= 6 && userMessages.some((m) => flat(m).includes(q));
}
