import type { PrismaService } from '../prisma/prisma.service';

// Every collection that holds one person's data, and how their rows are found. Delete and export
// both walk this list, in this order (children before parents, the user last), so a delete never
// leans on Prisma's emulated cascades half-way and an export never misses what a delete removes.
// account-data.spec.ts fails when a model is added to the schema without being listed here or in
// SHARED_MODELS.
type Scope = 'user' | 'seeker' | 'thread' | 'self';
export const ACCOUNT_DATA: [model: string, scope: Scope][] = [
  ['chatMessage', 'thread'],
  ['careerMessage', 'thread'],
  ['jobSeekerJobMatch', 'seeker'], // before discoveryRun (SetNull relation)
  ['discoveryRun', 'seeker'], // before chatThread (SetNull relation)
  ['searchCv', 'seeker'],
  ['careerResume', 'seeker'], // before careerThread (SetNull relation)
  ['chatThread', 'seeker'],
  ['careerThread', 'seeker'],
  ['mockInterview', 'seeker'],
  ['applyBatchItem', 'seeker'],
  ['applyBatch', 'seeker'],
  ['jobApplication', 'seeker'],
  ['extensionSiteAccount', 'seeker'],
  ['extensionPairing', 'seeker'],
  ['extensionDevice', 'seeker'],
  ['alertMatch', 'seeker'],
  ['alertDigest', 'seeker'],
  ['alertSettings', 'seeker'],
  ['jobAlert', 'seeker'],
  ['quizAttempt', 'seeker'],
  ['assessmentAttempt', 'seeker'],
  ['candidateReport', 'seeker'],
  ['quiz', 'seeker'],
  ['jobSeekerProject', 'seeker'],
  ['jobSeekerAchievement', 'seeker'],
  ['jobSeekerSkillEvidence', 'seeker'],
  ['jobSeekerResumeSettings', 'seeker'],
  ['skillCredential', 'seeker'],
  ['jobSeekerDocument', 'seeker'], // before its version
  ['jobSeekerDocumentVersion', 'seeker'],
  ['jobSeekerSocialLink', 'seeker'],
  ['jobSeekerExperience', 'seeker'],
  ['jobSeekerEducation', 'seeker'],
  ['jobSeekerCertification', 'seeker'],
  ['jobSeekerLanguage', 'seeker'],
  ['jobSeekerProfileEvaluation', 'seeker'],
  ['jobSeekerPreference', 'seeker'],
  ['authToken', 'user'],
  // Admin Logs rows naming the seeker (their failed requests, the extension's reports).
  ['errorLog', 'user'],
  // Which pages the seeker opened and for how long (admin panel usage analytics).
  ['pageActivity', 'user'],
  ['creditLedger', 'user'],
  ['creditAccount', 'user'],
  // Kept without the user id: it is Plato's own AI and Apify spend, and holds nothing personal.
  ['usageEvent', 'user'],
  ['jobSeeker', 'user'],
  ['user', 'self'],
];
export const ANONYMIZED_MODELS = ['usageEvent'];

// Not anyone's own data: shared by every seeker, or a visitor's before they had an account
// (claimed and deleted at sign-up, unclaimed rows expire after 7 days).
export const SHARED_MODELS = [
  'job',
  'quizLibrary',
  'companySource',
  'insightsCursor',
  'guest',
  'guestSearch',
  'plan',
  // Plato's admin panel accounts, not seekers.
  'adminUser',
  'adminRole',
  'adminInvite',
];

// Where each seeker's files sit in object storage (documents, proof screenshots, resumes Plato drew).
export const STORAGE_PREFIXES = [
  'job-seeker-documents',
  'proofs',
  'resumes',
  'career-resumes',
  'search-cvs',
];

const OBJECT_ID = /^[a-f0-9]{24}$/;
export type AccountIds = { userId: string; seekerId: string | null };

// A missing id must never reach Prisma: `{ job_seeker_id: undefined }` matches every row.
export function whereFor(scope: Scope, ids: AccountIds) {
  if (!OBJECT_ID.test(ids.userId)) throw new Error('Bad user id');
  if (scope === 'self') return { id: ids.userId };
  if (scope === 'user') return { user_id: ids.userId };
  if (!ids.seekerId || !OBJECT_ID.test(ids.seekerId)) return null;
  return scope === 'seeker'
    ? { job_seeker_id: ids.seekerId }
    : { thread: { job_seeker_id: ids.seekerId } };
}

type Delegate = {
  findMany(a: { where: object }): Promise<Record<string, unknown>[]>;
  deleteMany(a: { where: object }): Promise<{ count: number }>;
  updateMany(a: { where: object; data: object }): Promise<{ count: number }>;
};
const delegate = (prisma: PrismaService, model: string) =>
  (prisma as unknown as Record<string, Delegate>)[model];

export async function accountIds(prisma: PrismaService, userId: string) {
  const seeker = await prisma.jobSeeker.findUnique({
    where: { user_id: userId },
    select: { id: true },
  });
  return { userId, seekerId: seeker?.id ?? null };
}

/** Removes every row in ACCOUNT_DATA. Returns the count per collection. */
export async function deleteAccountRows(
  prisma: PrismaService,
  ids: AccountIds,
) {
  const counts: Record<string, number> = {};
  for (const [model, scope] of ACCOUNT_DATA) {
    const where = whereFor(scope, ids);
    if (!where) continue;
    const r = ANONYMIZED_MODELS.includes(model)
      ? await delegate(prisma, model).updateMany({
          where,
          data: { user_id: null },
        })
      : await delegate(prisma, model).deleteMany({ where });
    if (r.count) counts[model] = r.count;
  }
  return counts;
}

// Secrets and their hashes stay out of the download: a password hash, link and device token hashes, the unsubscribe secret.
const SECRET = /(_hash|_token)$|^sessions_valid_after$/;
const clean = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET.test(k)));

/** The same rows as a delete, for "Download my data". */
export async function exportAccountRows(
  prisma: PrismaService,
  ids: AccountIds,
) {
  const out: Record<string, unknown[]> = {};
  for (const [model, scope] of ACCOUNT_DATA) {
    const where = whereFor(scope, ids);
    if (!where) continue;
    const rows = await delegate(prisma, model).findMany({ where });
    if (rows.length) out[model] = rows.map(clean);
  }
  return out;
}
