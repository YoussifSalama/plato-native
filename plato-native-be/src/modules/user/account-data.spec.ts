import { Prisma } from '@prisma/client';
import {
  ACCOUNT_DATA,
  deleteAccountRows,
  SHARED_MODELS,
  whereFor,
} from './account-data';

const delegateName = (model: string) => model[0].toLowerCase() + model.slice(1);

describe('account data: what "delete my account" and "download my data" cover', () => {
  it('every model in the schema is either listed as account data or as shared; a new model fails here until it is placed', () => {
    const models = Prisma.dmmf.datamodel.models.map((m) =>
      delegateName(m.name),
    );
    const listed = ACCOUNT_DATA.map(([m]) => m);
    expect(listed.filter((m) => SHARED_MODELS.includes(m))).toEqual([]);
    expect([...listed, ...SHARED_MODELS].sort()).toEqual([...models].sort());
  });

  it('deletes these collections, children first and the user last', () => {
    expect(ACCOUNT_DATA.map(([m]) => m)).toMatchInlineSnapshot(`
      [
        "chatMessage",
        "careerMessage",
        "jobSeekerJobMatch",
        "discoveryRun",
        "searchCv",
        "careerResume",
        "chatThread",
        "careerThread",
        "mockInterview",
        "applyBatchItem",
        "applyBatch",
        "jobApplication",
        "extensionSiteAccount",
        "extensionPairing",
        "extensionDevice",
        "alertMatch",
        "alertDigest",
        "alertSettings",
        "jobAlert",
        "quizAttempt",
        "assessmentAttempt",
        "candidateReport",
        "quiz",
        "jobSeekerProject",
        "jobSeekerAchievement",
        "jobSeekerSkillEvidence",
        "jobSeekerResumeSettings",
        "skillCredential",
        "jobSeekerDocument",
        "jobSeekerDocumentVersion",
        "jobSeekerSocialLink",
        "jobSeekerExperience",
        "jobSeekerEducation",
        "jobSeekerCertification",
        "jobSeekerLanguage",
        "jobSeekerProfileEvaluation",
        "jobSeekerPreference",
        "authToken",
        "errorLog",
        "pageActivity",
        "creditLedger",
        "creditAccount",
        "usageEvent",
        "jobSeeker",
        "user",
      ]
    `);
  });

  it('every listed collection has the field its filter uses', () => {
    const fields = new Map(
      Prisma.dmmf.datamodel.models.map((m) => [
        delegateName(m.name),
        m.fields.map((f) => f.name),
      ]),
    );
    const ids = { userId: 'a'.repeat(24), seekerId: 'b'.repeat(24) };
    for (const [model, scope] of ACCOUNT_DATA)
      expect([model, fields.get(model)]).toEqual([
        model,
        expect.arrayContaining(Object.keys(whereFor(scope, ids)!)),
      ]);
  });

  it('never sends a filter without an id (Prisma reads `undefined` as "every row")', async () => {
    const calls: { model: string; where: object }[] = [];
    const prisma = new Proxy(
      {},
      {
        get: (_t, model: string) => ({
          deleteMany: async ({ where }: { where: object }) => (
            calls.push({ model, where }),
            { count: 1 }
          ),
          updateMany: async ({ where }: { where: object }) => (
            calls.push({ model, where }),
            { count: 1 }
          ),
        }),
      },
    );
    // No seeker profile: only the user-scoped rows are touched.
    await deleteAccountRows(prisma as never, {
      userId: 'a'.repeat(24),
      seekerId: null,
    });
    expect(calls.map((c) => c.model)).toEqual([
      'authToken',
      'errorLog',
      'pageActivity',
      'creditLedger',
      'creditAccount',
      'usageEvent',
      'jobSeeker',
      'user',
    ]);
    expect(JSON.stringify(calls)).not.toContain('null');
    expect(() => whereFor('user', { userId: '', seekerId: null })).toThrow();
  });
});
