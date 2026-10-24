// What kind of job is this? Plato is for professional (white-collar) work, so
// every posting gets a profession, an employment type, and manual-labour roles
// are dropped. Rules over the title (and the board's own type text); no model.

export type Profession =
  | 'engineering'
  | 'data'
  | 'design'
  | 'product'
  | 'marketing'
  | 'sales'
  | 'finance'
  | 'hr'
  | 'operations'
  | 'customer-support'
  | 'legal'
  | 'healthcare'
  | 'education'
  | 'management'
  | 'other';

const PROFESSION: [Profession, RegExp][] = [
  [
    'data',
    /\b(data (analyst|engineer|scientist)|machine learning|\bml\b|\bai\b|business intelligence|\bbi\b|analytics|statistician)\b/i,
  ],
  [
    'engineering',
    /\b(engineer|developer|programmer|software|devops|\bsre\b|architect|full[\s-]?stack|front[\s-]?end|back[\s-]?end|qa\b|tester|cyber|security (analyst|engineer)|sysadmin|it support)\b/i,
  ],
  [
    'design',
    /\b(designer|ux|ui\b|graphic|illustrator|creative director|art director|animator)\b/i,
  ],
  [
    'product',
    /\b(product (manager|owner|lead)|scrum master|project manager|program manager)\b/i,
  ],
  [
    'marketing',
    /\b(marketing|seo|content (writer|strategist|manager)|copywriter|social media|brand|growth|community manager|pr\b|communications)\b/i,
  ],
  [
    'sales',
    /\b(sales|account (executive|manager)|business development|\bbdr\b|\bsdr\b|customer success|partnerships?)\b/i,
  ],
  [
    'finance',
    /\b(accountant|accounting|finance|financial|auditor|controller|bookkeeper|treasury|tax|payroll|investment|banker|actuary)\b/i,
  ],
  [
    'hr',
    /\b(recruit(er|ment)|talent|human resources|\bhr\b|people (partner|operations))\b/i,
  ],
  [
    'customer-support',
    /\b(customer (support|service|care|experience)|support (agent|specialist|engineer)|help ?desk|call cent(er|re))\b/i,
  ],
  ['legal', /\b(lawyer|attorney|legal|paralegal|counsel|compliance)\b/i],
  [
    'healthcare',
    /\b(doctor|physician|nurse|pharmacist|dentist|clinical|medical|therapist)\b/i,
  ],
  [
    'education',
    /\b(teacher|lecturer|professor|tutor|instructor|trainer|curriculum)\b/i,
  ],
  [
    'operations',
    /\b(operations|logistics|supply chain|procurement|office manager|administrator|coordinator|executive assistant)\b/i,
  ],
  [
    'management',
    /\b(director|head of|vp\b|vice president|chief|general manager|manager)\b/i,
  ],
];

export function professionOf(title: string): Profession {
  return PROFESSION.find(([, re]) => re.test(title))?.[0] ?? 'other';
}

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'freelance'
  | 'internship'
  | 'graduate'
  | 'temporary';

// The board's own type text first, then the title.
export function employmentOf(
  title: string,
  jobType?: string | null,
): EmploymentType | null {
  const t = `${jobType ?? ''} ${title}`.toLowerCase();
  if (/intern(ship)?\b|trainee|apprentice/.test(t)) return 'internship';
  if (/graduate|new grad|entry[\s-]?level program|early careers?/.test(t))
    return 'graduate';
  if (/freelance|gig\b/.test(t)) return 'freelance';
  if (/part[\s_-]?time/.test(t)) return 'part_time';
  if (/temporary|temp\b|seasonal/.test(t)) return 'temporary';
  if (/contract|contractor|fixed[\s-]?term/.test(t)) return 'contract';
  if (/full[\s_-]?time|permanent/.test(t)) return 'full_time';
  return null;
}

// Manual or on-the-ground labour: out of scope. A single word is not enough
// ("Delivery Manager", "Security Engineer"), so a professional title word
// overrides, and most terms are phrases.
const PROFESSIONAL =
  /\b(engineer|developer|analyst|manager|director|consultant|architect|scientist|designer|accountant|specialist|officer|lead|head|programmer|researcher|strategist|coordinator|executive)\b/i;
const BLUE_COLLAR =
  /\b(driver|chauffeur|courier|rider|delivery (driver|rider|partner|associate)|warehouse (associate|worker|operative|picker|assistant)|picker|packer|forklift|loader|cleaner|janitor|housekeep(er|ing)|maid|laborer|labourer|construction worker|welder|electrician|plumber|carpenter|mason|painter|mechanic|technician (apprentice)?|fitter|machine operator|production operator|assembler|factory worker|security guard|guard|watchman|doorman|cashier|shelf stacker|store (assistant|associate)|barista|waiter|waitress|bartender|dishwasher|line cook|kitchen (hand|assistant)|farm ?hand|gardener|landscaper|caretaker|porter|bellhop|valet|tailor|butcher|baker)\b/i;

// "Technician" alone is ambiguous (IT technician is office work): only drop it with manual words.
export function isBlueCollar(title: string): boolean {
  if (PROFESSIONAL.test(title)) return false;
  return (
    BLUE_COLLAR.test(title) &&
    !/\b(it|software|network|cloud|data)\b.*\btechnician\b/i.test(title)
  );
}
