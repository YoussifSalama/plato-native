import { buildReview, checkField, dateKeys, foundIn, parseFieldList, polarity, profileEntries, saidEntries, sensitivity, type ClaimedField, type ReviewContext } from './review';
import { parseOutcome } from './v3-contract';

const CV = `Youssif Salama
youssif@example.com | +20 100 123 4567 | Cairo, Egypt
Senior Software Engineer, Acme Corp, 03/2019 - Present
Designed cloud solutions for enterprise clients on AWS and Kubernetes. Led a team of 6 engineers.
Software Engineer, Globex, March 2016 - February 2019
B.Sc. Computer Engineering, Cairo University, 2015
Expected salary 3,000 USD`;

const PROFILE = `Name: Youssif Salama
Location: Cairo, Egypt
Expected salary: 3000-4000 USD per month
Work authorization: Egypt
Needs visa sponsorship: yes
Willing to relocate: no
Seeker's answer for forms: "What is your notice period?": 1 month`;

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  cv: CV,
  answers: [
    { key: 'How did you hear about us?', value: 'LinkedIn' },
    { key: 'Are you legally authorized to work in Egypt?', value: 'Yes' },
    { key: 'هل لديك تصريح عمل في الإمارات؟', value: 'لا' },
    { key: 'Expected salary', value: '3500' },
  ],
  profile: profileEntries(PROFILE),
  job: 'Backend Engineer\nInitech\nDubai, United Arab Emirates\nWe build payment systems in Dubai.',
  today: '2026-11-26',
  coverLetter: true,
  resumeUploaded: true,
  ...over,
});
const f = (label: string, value: string, source: ClaimedField['source'], evidence?: string): ClaimedField => ({ label, value, source, ...(evidence && { evidence }) });
const check = (label: string, value: string, source: ClaimedField['source'], over?: Partial<ReviewContext>) => checkField(f(label, value, source), ctx(over));

describe('parseFieldList', () => {
  const block = '```json\n{"fields":[{"label":"Email","value":"youssif@example.com","source":"cv"}]}\n```';

  it('reads the fenced block after SUBMIT_READY', () => {
    expect(parseFieldList(`All set.\nSUBMIT_READY Name, email, resume.\n${block}`)).toEqual([{ label: 'Email', value: 'youssif@example.com', source: 'cv' }]);
  });
  it('reads a bare object too', () => {
    expect(parseFieldList('SUBMIT_READY done {"fields":[{"label":"Phone","value":"+20 100 123 4567","source":"cv"}]}')).toHaveLength(1);
  });
  it('a missing, broken or wrong-shaped list is null', () => {
    expect(parseFieldList('SUBMIT_READY everything is filled')).toBeNull();
    expect(parseFieldList('SUBMIT_READY x\n```json\n{"fields":[{"label":"Email",}]}\n```')).toBeNull();
    expect(parseFieldList('SUBMIT_READY x\n```json\n{"items":[]}\n```')).toBeNull();
    expect(parseFieldList('SUBMIT_READY x\n```json\n{"fields":[{"value":"no label","source":"cv"}]}\n```')).toBeNull();
  });
  it('coerces numbers, booleans and lists to text; an unknown source is a guess', () => {
    const list = parseFieldList('SUBMIT_READY x\n```json\n{"fields":[{"label":"Years","value":9,"source":"CV"},{"label":"Relocate","value":false,"source":"answer"},{"label":"Skills","value":["Go","AWS"],"source":"resume"}]}\n```');
    expect(list).toEqual([
      { label: 'Years', value: '9', source: 'cv' },
      { label: 'Relocate', value: 'false', source: 'answer' },
      { label: 'Skills', value: 'Go, AWS', source: 'guess' },
    ]);
  });
  it('uses the block after the LAST SUBMIT_READY', () => {
    const t = 'SUBMIT_READY first\n```json\n{"fields":[]}\n```\nFixed it.\nSUBMIT_READY second\n```json\n{"fields":[{"label":"City","value":"Cairo","source":"cv"}]}\n```';
    expect(parseFieldList(t)).toEqual([{ label: 'City', value: 'Cairo', source: 'cv' }]);
  });
  it('parseOutcome keeps the summary and leaves the block out of it', () => {
    expect(parseOutcome(`Done.\nSUBMIT_READY — Name, email, resume.\n${block}`)).toEqual({ kind: 'submit_ready', summary: 'Name, email, resume.' });
  });
});

describe('verifying each source', () => {
  it('cv: found in the CV text; not found is unverified', () => {
    expect(check('Full name', 'Youssif Salama', 'cv')).toMatchObject({ verified: true, status: 'ok' });
    expect(check('Email', 'youssif@example.com', 'cv').verified).toBe(true);
    expect(check('Current company', 'ACME corp.', 'cv').verified).toBe(true); // case and punctuation
    expect(check('Current company', 'Initech', 'cv')).toMatchObject({ verified: false, status: 'unverified' });
    expect(check('Have you led a team?', 'Yes', 'cv').verified).toBe(false); // a CV never states a bare Yes
  });
  it('cv: long text matches by strong token overlap only', () => {
    expect(check('Summary', 'Designed cloud solutions for enterprise clients on AWS and Kubernetes', 'cv').verified).toBe(true);
    expect(check('Summary', 'Built mobile games with Unity and C# for console players', 'cv').verified).toBe(false);
  });
  it('cv: the uploaded resume is verified only when an upload ran', () => {
    expect(check('Resume/CV', 'Youssif Salama CV.pdf', 'cv').verified).toBe(true);
    expect(check('Resume/CV', 'Youssif Salama CV.pdf', 'cv', { resumeUploaded: false }).verified).toBe(false);
  });
  it('answer: a saved answer, a fact, or what the seeker said here', () => {
    expect(check('How did you hear about this job?', 'LinkedIn', 'answer').verified).toBe(true);
    expect(check('Where did you find us?', 'Indeed', 'answer').verified).toBe(false);
    const said = saidEntries('Change these fields before submitting: Expected salary: 4200; Notice period: 2 weeks', [{ label: 'Start date', value: '2027-01-15' }]);
    expect(check('Expected salary', '4200', 'answer', { answers: said }).verified).toBe(true);
    expect(check('Notice period', '2 weeks', 'answer', { answers: said }).verified).toBe(true);
    expect(check('Start date', '01/15/2027', 'answer', { answers: said }).verified).toBe(true);
  });
  it('answer / profile: a bare Yes or No only counts from a line about the same question', () => {
    expect(check('Are you authorized to work in Egypt?', 'Yes', 'answer').verified).toBe(true);
    expect(check('Are you authorized to work in Egypt?', 'No', 'answer').verified).toBe(false);
    expect(check('Will you require visa sponsorship?', 'Yes, I will need sponsorship', 'profile').verified).toBe(true);
    expect(check('Will you require visa sponsorship?', 'No', 'profile').verified).toBe(false);
    expect(check('Are you willing to relocate?', 'No', 'profile').verified).toBe(true);
    expect(check('Do you have a driving licence?', 'No', 'profile').verified).toBe(false); // "relocate: no" is another question
  });
  it('profile: found in a PROFILE line', () => {
    expect(check('City', 'Cairo', 'profile').verified).toBe(true);
    expect(check('Notice period', '1 month', 'profile').verified).toBe(true);
    expect(check('City', 'Alexandria', 'profile').verified).toBe(false);
  });
  it('job: found in the job text', () => {
    expect(check('Company', 'Initech', 'job').verified).toBe(true);
    expect(check('Company', 'Hooli', 'job').verified).toBe(false);
  });
  it('rule: only the known rule fills', () => {
    expect(check('Postal code', '11511', 'rule').verified).toBe(true);
    expect(check('ZIP', '00000', 'rule').verified).toBe(true);
    expect(check('Availability date', '11/26/2026', 'rule').verified).toBe(true); // today
    expect(check('Availability date', '12/01/2026', 'rule').verified).toBe(false); // not today
    expect(check('Which location are you applying for?', 'Dubai', 'rule').verified).toBe(true);
    expect(check('Which location are you applying for?', 'London', 'rule').verified).toBe(false);
    expect(check('Cover letter', 'Dear hiring team, …', 'rule').verified).toBe(true);
    expect(check('Cover letter', 'Dear hiring team, …', 'rule', { coverLetter: false }).verified).toBe(false);
    expect(check('Expected salary', '3000', 'rule').verified).toBe(false); // salary is no rule fill
  });
  it('guess: never verified, status guess', () => {
    expect(check('Full name', 'Youssif Salama', 'guess')).toMatchObject({ verified: false, status: 'guess' });
  });
  it('evidence is kept, trimmed', () => {
    const [x] = parseFieldList('SUBMIT_READY x {"fields":[{"label":"Email","value":"youssif@example.com","source":"cv","evidence":"  from the CV header "}]}')!;
    expect(checkField(x, ctx()).evidence).toBe('from the CV header');
  });
});

describe('evidence', () => {
  const ev = (label: string, value: string, source: ClaimedField['source'], evidence: string, over?: Partial<ReviewContext>) => checkField(f(label, value, source, evidence), ctx(over)).verified;
  it('a quote found in the source backs a Yes/No or a worked-out value on a non-sensitive field', () => {
    expect(ev('Have you led a team?', 'Yes', 'cv', 'Led a team of 6 engineers')).toBe(true);
    expect(ev('Have you used Kubernetes?', 'Yes', 'cv', 'on AWS and Kubernetes')).toBe(true);
    expect(ev('Have you used Terraform?', 'Yes', 'cv', 'Terraform modules for AWS')).toBe(false); // the quote is not in the CV
    expect(ev('Is this role based in Dubai?', 'Yes', 'job', 'Dubai, United Arab Emirates')).toBe(true);
    expect(ev('Willing to travel?', 'No', 'profile', 'Willing to relocate: no')).toBe(true);
    expect(ev('Have you heard of us before?', 'Yes', 'answer', 'How did you hear about us?: LinkedIn')).toBe(true);
  });
  it('a real quote never backs a different answer', () => {
    expect(ev('How did you hear about us?', 'Social media', 'answer', 'How did you hear about us?: LinkedIn')).toBe(false);
    expect(ev('How did you hear about us?', 'LinkedIn', 'answer', 'How did you hear about us?: LinkedIn')).toBe(true);
  });
  it('sensitive fields stay strict: the value itself must check out', () => {
    expect(ev('Are you authorized to work in the UAE?', 'Yes', 'cv', 'Cairo, Egypt')).toBe(false);
    expect(ev('Will you require visa sponsorship?', 'Yes', 'profile', 'Needs visa sponsorship: yes')).toBe(true); // the value checks out too
    expect(ev('Will you require visa sponsorship?', 'No', 'profile', 'Needs visa sponsorship: yes')).toBe(false);
  });
  it('a number counts only when the quote holds it and the quote is in the source', () => {
    expect(ev('Team size you managed', '6', 'cv', 'Led a team of 6 engineers')).toBe(true);
    expect(ev('Years of experience', '5', 'cv', 'Senior Software Engineer, Acme Corp, 03/2019 - Present', { cv: `${CV}\nCertified in 5 clouds` })).toBe(false); // a 5 in the CV, not in the quote
    expect(foundIn('5', `${CV}\nCertified in 5 clouds`)).toBe(true); // without evidence the whole-run match would have taken it
    expect(ev('Team size you managed', '6', 'cv', 'Led a team of 6 people')).toBe(false); // quote not in the CV
    expect(ev('Expected salary (USD)', '3500', 'answer', 'Answered before: "Expected salary": 3500', { profile: profileEntries('Answered before: "Expected salary": 3500') })).toBe(true);
    expect(ev('Expected salary (USD)', '3500', 'answer', 'Answered before: expected salary')).toBe(false); // the quote lacks the number
    expect(ev('Expected salary (USD)', '4000', 'profile', 'Expected salary: 3000-4000 USD per month')).toBe(true); // sensitive: value and quote both check out
  });
});

describe('numbers and dates match exactly', () => {
  it('numbers', () => {
    expect(foundIn('3000', CV)).toBe(true); // "3,000" in the CV
    expect(foundIn('30000', CV)).toBe(false);
    expect(foundIn('300', CV)).toBe(false);
    expect(foundIn('3000 USD per month', CV)).toBe(true); // the number is the fact, the rest its unit
    expect(foundIn('+201001234567', CV)).toBe(true); // a phone without its spaces
    expect(foundIn('+20 100 123 4567', CV)).toBe(true);
    expect(foundIn('+20 100 123 4568', CV)).toBe(false);
    expect(foundIn('٣٠٠٠', CV)).toBe(true); // Arabic-Indic digits
    expect(foundIn('7', CV)).toBe(false);
  });
  it('dates, in any common format', () => {
    expect(foundIn('2019-03', CV)).toBe(true);
    expect(foundIn('March 2019', CV)).toBe(true);
    expect(foundIn('03/2016', CV)).toBe(true); // "March 2016"
    expect(foundIn('04/2019', CV)).toBe(false);
    expect(foundIn('2016', CV)).toBe(true); // a year is a number
    expect([...dateKeys('26/11/2026')]).toEqual(['2026-11', '2026-11-26']);
    expect(dateKeys('03/04/2026').has('2026-03-04') && dateKeys('03/04/2026').has('2026-04-03')).toBe(true); // ambiguous: both
    expect(dateKeys('Nov 26th, 2026').has('2026-11-26')).toBe(true);
    expect(dateKeys('26 November 2026').has('2026-11-26')).toBe(true);
  });
});

describe('Arabic and English labels', () => {
  it('Arabic values and labels are normalised (diacritics, alef forms)', () => {
    const c = { cv: 'المهندس يوسف سلامة، القاهرة', answers: [{ key: 'هل أنت مستعد للانتقال؟', value: 'نعم' }] };
    expect(check('الاسم', 'يوسف سلامه', 'cv', c).verified).toBe(true); // ة / ه
    expect(check('المدينة', 'القاهره', 'cv', c).verified).toBe(true);
    expect(check('هل انت مستعد للانتقال؟', 'نعم', 'answer', c).verified).toBe(true);
    expect(check('هل لديك تصريح عمل في الإمارات؟', 'لا', 'answer').verified).toBe(true);
    expect(check('هل لديك تصريح عمل في الإمارات؟', 'نعم', 'answer').verified).toBe(false);
  });
  it('polarity reads the leading word in both languages', () => {
    expect(polarity('Yes, I am authorized')).toBe(true);
    expect(polarity('No')).toBe(false);
    expect(polarity('نعم')).toBe(true);
    expect(polarity('لا أحتاج')).toBe(false);
    expect(polarity('Cairo')).toBeUndefined();
  });
});

describe('sensitive categories come from the label', () => {
  it.each([
    ['Expected salary (USD)', 'pay'],
    ['Desired compensation', 'pay'],
    ['Hourly rate', 'pay'],
    ['الراتب المتوقع', 'pay'],
    ['ما هو الأجر المتوقع؟', 'pay'],
    ['Are you legally authorized to work in the United States?', 'work_auth'],
    ['Do you have the right to work in the UK?', 'work_auth'],
    ['Work permit', 'work_auth'],
    ['هل لديك تصريح عمل؟', 'work_auth'],
    ['Will you now or in the future require visa sponsorship?', 'sponsorship'],
    ['هل تحتاج إلى تأشيرة؟', 'sponsorship'],
    ['Have you ever been convicted of a criminal offence?', 'legal'],
    ['Do you consent to a background check?', 'legal'],
    ['Are you bound by a non-compete agreement?', 'legal'],
    ['هل لديك سوابق جنائية؟', 'legal'],
    ['Gender', 'demographic'],
    ['Race / Ethnicity', 'demographic'],
    ['Do you have a disability?', 'demographic'],
    ['Veteran status', 'demographic'],
    ['الجنس', 'demographic'],
  ])('%s -> %s', (label, cat) => {
    expect(sensitivity(label)).toBe(cat);
    expect(checkField(f(label, 'x', 'guess'), ctx())).toMatchObject({ sensitive: true, category: cat });
  });
  it.each(['Full name', 'Rate your English (1-5)', 'Do you authorize us to contact your references?', 'Upload your portfolio', 'الإجراءات التي اتبعتها', 'Email'])('%s is not sensitive', (label) => {
    expect(sensitivity(label)).toBeUndefined();
    expect(checkField(f(label, 'x', 'guess'), ctx())).toMatchObject({ sensitive: false });
    expect(checkField(f(label, 'x', 'guess'), ctx()).category).toBeUndefined();
  });
});

describe('hold', () => {
  const ok = f('Full name', 'Youssif Salama', 'cv');
  const salaryOk = f('Expected salary', '3500', 'answer');
  const salaryGuess = f('Expected salary', '5000', 'guess');
  const salaryWrong = f('Expected salary', '9000', 'answer'); // claimed, not found
  const guessPlain = f('How did you hear about us?', 'Indeed', 'guess');

  it('review mode always holds, whatever the list', () => {
    expect(buildReview([ok], ctx(), 'review')).toMatchObject({ complete: true, hold: true, holdReason: 'review_mode' });
    expect(buildReview(null, ctx(), 'review')).toMatchObject({ complete: false, hold: true, holdReason: 'review_mode' });
  });
  it('auto mode: no hold when every sensitive field is ok (a plain guess does not hold)', () => {
    const r = buildReview([ok, salaryOk, guessPlain], ctx(), 'auto');
    expect(r).toEqual(expect.objectContaining({ complete: true, hold: false }));
    expect(r.holdReason).toBeUndefined();
    expect(r.fields.map((x) => x.status)).toEqual(['ok', 'ok', 'guess']);
  });
  it('auto mode: a sensitive guess or an unverified sensitive field holds', () => {
    expect(buildReview([ok, salaryGuess], ctx(), 'auto')).toMatchObject({ hold: true, holdReason: 'sensitive' });
    expect(buildReview([ok, salaryWrong], ctx(), 'auto')).toMatchObject({ hold: true, holdReason: 'sensitive' });
  });
  it('a missing list: nothing is known, so it holds in both modes', () => {
    expect(buildReview(null, ctx(), 'auto')).toEqual({ fields: [], complete: false, hold: true, holdReason: 'no_list' });
  });
  it('an empty list is a complete one', () => {
    expect(buildReview([], ctx(), 'auto')).toEqual({ fields: [], complete: true, hold: false });
  });
});

describe('profile and conversation entries', () => {
  it('splits PROFILE lines into key and value, quoted questions included', () => {
    expect(profileEntries(PROFILE).at(-1)).toEqual({ key: 'Seeker\'s answer for forms: "What is your notice period?"', value: '1 month' });
    expect(profileEntries('Location: Cairo, Egypt')[0]).toEqual({ key: 'Location', value: 'Cairo, Egypt' });
  });
  it('the seeker\'s structured answers and each part of their text', () => {
    expect(saidEntries('Salary: 4000; I can start next month', [{ label: 'Relocate?', value: 'No' }])).toEqual([
      { key: 'Relocate?', value: 'No' },
      { key: 'Salary', value: '4000' },
      { value: 'I can start next month' },
    ]);
  });
});
