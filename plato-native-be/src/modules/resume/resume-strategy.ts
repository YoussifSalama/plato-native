import {
  Market,
  MarketOverrides,
  ResumeStrategy,
  SectionKey,
  Stage,
  TemplateId,
} from './resume.types';

// Deterministic rules. Evidence: US/Canada/UK/Germany from official guidance
// (CareerOneStop, Job Bank, National Careers Service, Federal Employment
// Agency); Gulf from commercial CV sites; Egypt is a product default.

const GCC = new Set(['AE', 'SA', 'QA', 'KW', 'BH', 'OM']);
const EU = new Set([
  'FR',
  'NL',
  'ES',
  'IT',
  'IE',
  'BE',
  'AT',
  'PL',
  'PT',
  'SE',
  'DK',
  'FI',
  'CZ',
  'GR',
  'RO',
  'HU',
  'LU',
]);

export function marketFromCountry(code: string | null | undefined): Market {
  if (!code) return 'OTHER';
  if (code === 'US') return 'US';
  if (code === 'CA') return 'CA';
  if (code === 'GB') return 'UK';
  if (code === 'DE') return 'DE';
  if (code === 'EG') return 'EG';
  if (GCC.has(code)) return 'GCC';
  if (EU.has(code)) return 'EU';
  return 'OTHER';
}

export function stageOf(totalYears: number | null): Stage {
  const years = totalYears ?? 0;
  if (years < 1) return 'entry';
  if (years < 3) return 'junior';
  if (years < 8) return 'mid';
  return 'senior';
}

function maxPages(market: Market, stage: Stage): 1 | 2 | 3 {
  const early = stage === 'entry' || stage === 'junior';
  if (market === 'GCC') return early ? 2 : 3;
  if (market === 'UK' || market === 'DE') return stage === 'entry' ? 1 : 2;
  return early ? 1 : 2;
}

const EARLY: SectionKey[] = [
  'summary',
  'education',
  'projects',
  'experience',
  'skills',
  'certifications',
  'languages',
];
const STANDARD: SectionKey[] = [
  'summary',
  'experience',
  'projects',
  'skills',
  'education',
  'certifications',
  'languages',
];
const CHANGER: SectionKey[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'languages',
];

export interface StrategyInput {
  market: Market;
  stage: Stage;
  careerChanger?: boolean;
  template?: TemplateId;
  overrides?: MarketOverrides;
}

// Egypt has no authoritative source: ask the seeker once, remember the answer.
export const needsMarketPreference = (
  market: Market,
  overrides: MarketOverrides,
) => market === 'EG' && overrides.EG === undefined;

export function decideStrategy(input: StrategyInput): ResumeStrategy {
  const { market, stage } = input;
  const careerChanger = !!input.careerChanger;
  const reasons: string[] = [];

  const pages = maxPages(market, stage);
  reasons.push(
    `${pages === 1 ? 'One page' : `Up to ${pages} pages`} for a ${stage}-level candidate in this market.`,
  );

  const sections = careerChanger
    ? CHANGER
    : stage === 'entry'
      ? EARLY
      : STANDARD;
  reasons.push(
    careerChanger
      ? 'Skills first, then history, because you are changing direction.'
      : stage === 'entry'
        ? 'Education and projects lead, because experience is still short.'
        : 'Experience leads, with impact in each role.',
  );

  // The seeker's own choice beats the market default.
  const chosen = input.overrides?.[market]?.personalBlock;
  const nationality = chosen ?? market === 'GCC';
  if (nationality)
    reasons.push(
      'A personal details block is included, as employers here expect it.',
    );
  else if (market === 'US' || market === 'CA' || market === 'UK')
    reasons.push(
      'No photo, age or nationality, as is standard in this market.',
    );
  else if (market === 'EG')
    reasons.push(
      'Conservative layout with no photo or personal block, until you say otherwise.',
    );

  const photo =
    market === 'DE' || market === 'GCC'
      ? 'optional'
      : market === 'US' || market === 'CA' || market === 'UK'
        ? 'avoid'
        : 'none';
  reasons.push(
    'Single column, standard headings and fonts, so automated systems and people can both read it.',
  );

  return {
    market,
    stage,
    careerChanger,
    format: careerChanger ? 'hybrid' : 'chronological',
    maxPages: pages,
    sections,
    nationality,
    photo,
    template: input.template ?? 'classic',
    reasons,
  };
}
