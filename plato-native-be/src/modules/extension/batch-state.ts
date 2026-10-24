// Item state machine for the extension apply engine. Pure data: the service
// enforces it with conditional updates.
export const ITEM_STATES = [
  'PENDING',
  'CLAIMED',
  'PREPARING',
  'NEEDS_USER',
  'FILLING',
  'REVIEW',
  'AWAITING_SUBMIT',
  'SUBMITTED_CONFIRMED',
  'SUBMITTED_ATTESTED',
  'VERIFY',
  'FAILED',
  'SKIPPED',
  'CANCELLED',
] as const;

export type ItemState =
  | 'PENDING'
  | 'CLAIMED'
  | 'PREPARING'
  | 'NEEDS_USER'
  | 'FILLING'
  | 'REVIEW'
  | 'AWAITING_SUBMIT'
  | 'SUBMITTED_CONFIRMED'
  | 'SUBMITTED_ATTESTED'
  | 'VERIFY'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELLED';

// Before the page is shown ready to submit: nothing can have been sent, so a
// lost lease safely releases the item.
export const PRE_ARMED: ItemState[] = [
  'CLAIMED',
  'PREPARING',
  'NEEDS_USER',
  'FILLING',
  'REVIEW',
];
export const TERMINAL: ItemState[] = [
  'SUBMITTED_CONFIRMED',
  'SUBMITTED_ATTESTED',
  'FAILED',
  'SKIPPED',
  'CANCELLED',
];

// What the extension may move an item to. CLAIMED comes only from /claim;
// recovery (lease expiry) is done by the server, not by this table.
export const TRANSITIONS: Record<ItemState, ItemState[]> = {
  PENDING: [],
  CLAIMED: ['PREPARING', 'FAILED', 'SKIPPED', 'CANCELLED'],
  PREPARING: ['NEEDS_USER', 'FILLING', 'FAILED', 'SKIPPED', 'CANCELLED'],
  NEEDS_USER: ['PREPARING', 'FILLING', 'FAILED', 'SKIPPED', 'CANCELLED'],
  FILLING: ['NEEDS_USER', 'REVIEW', 'FAILED', 'CANCELLED'],
  REVIEW: ['FILLING', 'AWAITING_SUBMIT', 'FAILED', 'SKIPPED', 'CANCELLED'],
  // Once armed there is no way back to "nothing happened": only evidence or
  // the person settles it. No CANCELLED / FAILED / SKIPPED from here.
  AWAITING_SUBMIT: ['SUBMITTED_CONFIRMED', 'SUBMITTED_ATTESTED', 'VERIFY'],
  VERIFY: ['SUBMITTED_CONFIRMED', 'SUBMITTED_ATTESTED', 'FAILED'],
  SUBMITTED_CONFIRMED: [],
  SUBMITTED_ATTESTED: [],
  FAILED: [],
  SKIPPED: [],
  CANCELLED: [],
};

export const canMove = (from: ItemState, to: ItemState) =>
  TRANSITIONS[from].includes(to);

export const LEASE_MS = 90_000;

// What a client may ask for in /transition (CLAIMED comes only from /claim).
export const TRANSITION_TARGETS = ITEM_STATES.filter(
  (s): s is Exclude<ItemState, 'PENDING' | 'CLAIMED'> =>
    s !== 'PENDING' && s !== 'CLAIMED',
);
