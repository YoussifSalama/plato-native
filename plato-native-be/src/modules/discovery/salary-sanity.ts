import { CountryCode } from './countries';

// Rough guide, not a market survey: is this monthly pay believable for where
// the seeker lives and where they want to work? Used to prompt "are you
// sure?", never to block. Figures are round numbers for professional
// full-time roles.
// ponytail: static FX and bands; move to a maintained dataset if it matters.

// USD per 1 unit of currency.
const USD_PER: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.65,
  CHF: 1.1,
  SGD: 0.74,
  AED: 0.272,
  SAR: 0.267,
  QAR: 0.275,
  KWD: 3.25,
  EGP: 0.02,
  JOD: 1.41,
  INR: 0.012,
  PKR: 0.0036,
  NGN: 0.00065,
  KES: 0.0077,
  ZAR: 0.055,
  TRY: 0.03,
  PLN: 0.25,
  BRL: 0.18,
  MXN: 0.055,
  JPY: 0.0067,
  KRW: 0.00073,
  IDR: 0.000063,
};

type Tier = 'HIGH' | 'MID' | 'LOW';
const HIGH = new Set([
  'US',
  'CA',
  'GB',
  'DE',
  'NL',
  'FR',
  'AU',
  'CH',
  'SG',
  'IE',
  'SE',
  'NO',
  'DK',
  'FI',
  'AT',
  'BE',
  'NZ',
  'LU',
]);
const LOW = new Set([
  'EG',
  'JO',
  'IN',
  'PK',
  'BD',
  'NG',
  'KE',
  'GH',
  'ET',
  'ID',
  'PH',
  'VN',
  'LK',
  'MA',
  'TN',
  'DZ',
  'UA',
  'NP',
]);
const tierOf = (c: CountryCode): Tier =>
  HIGH.has(c) ? 'HIGH' : LOW.has(c) ? 'LOW' : 'MID';

// Monthly gross USD: below `min` reads as too low, above `warn` as too high.
interface Band {
  min: number;
  typicalMax: number;
  warn: number;
}
const LOCAL: Record<Tier, Band> = {
  HIGH: { min: 3000, typicalMax: 12000, warn: 18000 },
  MID: { min: 1200, typicalMax: 5000, warn: 9000 },
  LOW: { min: 350, typicalMax: 2200, warn: 4500 },
};
// Someone in a LOW/MID market working remotely for a HIGH-market employer.
const REMOTE_ABROAD: Band = { min: 1500, typicalMax: 5500, warn: 8000 };

export interface SalaryInput {
  amount: number;
  currency: string;
  period: 'MONTHLY' | 'YEARLY';
  residence: CountryCode | null;
  targets: CountryCode[];
  remote: boolean;
}

export interface SalaryVerdict {
  verdict: 'ok' | 'low' | 'high';
  monthlyUsd: number;
  typical: { min: number; max: number };
  market: string;
  note: string;
}

export function checkSalary(i: SalaryInput): SalaryVerdict | null {
  const fx = USD_PER[i.currency.toUpperCase()];
  if (!fx || !(i.amount > 0)) return null;
  const monthlyUsd = Math.round(
    (i.period === 'YEARLY' ? i.amount / 12 : i.amount) * fx,
  );

  const places = i.targets.length
    ? i.targets
    : i.residence
      ? [i.residence]
      : [];
  if (!places.length) return null;
  const abroadRemote =
    i.remote &&
    !!i.residence &&
    !places.includes(i.residence) &&
    tierOf(i.residence) !== 'HIGH' &&
    places.some((p) => tierOf(p) === 'HIGH');

  let band: Band;
  let market: string;
  if (abroadRemote) {
    band = REMOTE_ABROAD;
    market = `remote work from ${i.residence} for ${places.join('/')} employers`;
  } else {
    const bands = places.map((p) => LOCAL[tierOf(p)]);
    band = {
      min: Math.min(...bands.map((b) => b.min)),
      typicalMax: Math.max(...bands.map((b) => b.typicalMax)),
      warn: Math.max(...bands.map((b) => b.warn)),
    };
    market = places.join('/');
  }

  const verdict =
    monthlyUsd < band.min ? 'low' : monthlyUsd > band.warn ? 'high' : 'ok';
  const typical = { min: band.min, max: band.typicalMax };
  const range = `about $${typical.min.toLocaleString('en-US')}–$${typical.max.toLocaleString('en-US')}/month`;
  const note =
    verdict === 'ok'
      ? `Within the usual range for ${market} (${range}).`
      : verdict === 'low'
        ? `Lower than usual for ${market}: typical is ${range}. They may be underselling themselves.`
        : `Higher than usual for ${market}: typical is ${range}. It may filter out most jobs.`;
  return { verdict, monthlyUsd, typical, market, note };
}
