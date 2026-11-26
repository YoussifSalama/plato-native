import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

// @nestjs/config and @nestjs/jwt ship as ESM, which this Jest setup does not load; neither runs here.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { checkFile, DocumentsController } from './documents.controller';

describe('DocumentsController: a seeker touches only their own documents', () => {
  const D1 = '64b000000000000000000001';
  const doc = {
    id: D1,
    job_seeker_id: 'victim',
    document_version_id: 'v1',
    storage_key: 'k1',
  };
  const file = {
    originalname: 'cv.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('x'),
  } as Express.Multer.File;

  function setup(caller: string) {
    const storage = {
      upload: jest.fn(async () => 'k2'),
      delete: jest.fn(async () => undefined),
      getObjectBuffer: jest.fn(async () => Buffer.from('%PDF')),
    };
    const documents = {
      findById: jest.fn(async () => doc),
      update: jest.fn(async () => doc),
      remove: jest.fn(async () => doc),
    };
    const versions = {
      findById: jest.fn(async () => ({ id: 'v1', replacement_count: 0 })),
      incrementReplacementCount: jest.fn(async () => 1),
    };
    const ctrl = new DocumentsController(
      { getByUserId: jest.fn(async () => ({ id: caller })) } as never,
      documents as never,
      versions as never,
      storage as never,
      { extract: jest.fn(async () => 'text') } as never,
    );
    return { ctrl, storage, documents };
  }
  const req = { userId: 'u' } as never;

  it("someone else's file can't be read; your own comes back as a PDF", async () => {
    const res = { setHeader: jest.fn(), send: jest.fn() };
    res.setHeader.mockReturnValue(res);
    const other = setup('attacker');
    await expect(other.ctrl.file(req, D1, res as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(other.storage.getObjectBuffer).not.toHaveBeenCalled();
    const own = setup('victim');
    await own.ctrl.file(req, D1, res as never);
    expect(own.storage.getObjectBuffer).toHaveBeenCalledWith('k1');
    expect(res.send).toHaveBeenCalled();
  });

  it("someone else's document: replace and delete answer 404 and change nothing", async () => {
    const { ctrl, storage, documents } = setup('attacker');
    await expect(ctrl.replace(req, D1, file)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(ctrl.remove(req, D1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(documents.update).not.toHaveBeenCalled();
    expect(documents.remove).not.toHaveBeenCalled();
  });

  it('their own document: delete works', async () => {
    const { ctrl, storage, documents } = setup('victim');
    await ctrl.remove(req, D1);
    expect(storage.delete).toHaveBeenCalledWith('k1');
    expect(documents.remove).toHaveBeenCalledWith(D1);
  });
});

describe('DocumentsController: which batch an upload joins', () => {
  const file = {
    originalname: 'x.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('x'),
  } as Express.Multer.File;
  const req = { userId: 'u' } as never;

  function setup() {
    const documents = {
      add: jest.fn(async (_id: string, d: { document_version_id: string }) => ({
        id: 'd9',
        ...d,
      })),
      update: jest.fn(async (id: string, d: object) => ({ id, ...d })),
    };
    const versions = {
      // The current batch was already analyzed (Plato read the CV).
      getCurrent: jest.fn(async () => ({ id: 'v1', analyzed_at: new Date() })),
      getOrCreateCurrent: jest.fn(async () => ({ id: 'v2' })),
    };
    (documents as Record<string, unknown>).listByVersion = jest.fn(
      async () => [],
    );
    const ctrl = new DocumentsController(
      { getByUserId: jest.fn(async () => ({ id: 'seeker' })) } as never,
      documents as never,
      versions as never,
      { upload: jest.fn(async () => 'k'), delete: jest.fn() } as never,
      { extract: jest.fn(async () => 'text') } as never,
    );
    return { ctrl, documents, versions };
  }

  it('a supporting document joins the analyzed batch, next to its CV', async () => {
    const { ctrl, documents, versions } = setup();
    await ctrl.upload(req, file, 'COVER_LETTER');
    expect(versions.getOrCreateCurrent).not.toHaveBeenCalled();
    expect(documents.add).toHaveBeenCalledWith(
      'seeker',
      expect.objectContaining({
        type: 'COVER_LETTER',
        document_version_id: 'v1',
      }),
    );
  });

  it('a new CV still starts a new batch', async () => {
    const { ctrl, documents, versions } = setup();
    await ctrl.upload(req, file, 'CV_RESUME');
    expect(versions.getCurrent).not.toHaveBeenCalled();
    expect(documents.add).toHaveBeenCalledWith(
      'seeker',
      expect.objectContaining({ document_version_id: 'v2' }),
    );
  });
});

describe('DocumentsController: replacing a document', () => {
  const D1 = '64b000000000000000000001';
  const pdf = (name = 'new.pdf') =>
    ({
      originalname: name,
      mimetype: 'application/pdf',
      buffer: Buffer.from('x'),
    }) as Express.Multer.File;
  const req = { userId: 'u' } as never;

  function setup(
    opts: { used?: number; status?: string; fails?: boolean } = {},
  ) {
    const doc = {
      id: D1,
      job_seeker_id: 's',
      document_version_id: 'v1',
      storage_key: 'old-key',
      type: 'CV_RESUME',
      status: opts.status ?? 'READY',
    };
    const storage = {
      upload: jest.fn(() => 'new-key'),
      delete: jest.fn(() => undefined),
    };
    const documents = {
      findById: jest.fn(() => doc),
      update: jest.fn((id: string, d: object) => ({ ...doc, ...d })),
      listByVersion: jest.fn(() => [doc]),
      remove: jest.fn(() => doc),
      retireOtherCvs: jest.fn(() => ({ count: 1 })),
      purgeRetiredCvs: jest.fn(() => 1),
    };
    const versions = {
      findById: jest.fn(() => ({
        id: 'v1',
        replacement_count: opts.used ?? 0,
      })),
      incrementReplacementCount: jest.fn(() => (opts.used ?? 0) + 1),
      getOrCreateCurrent: jest.fn(() => ({ id: 'v1' })),
      getCurrent: jest.fn(() => ({ id: 'v1' })),
    };
    const extract = jest.fn(() => {
      if (opts.fails) throw new Error('Extracted text is empty');
      return 'new text';
    });
    const ctrl = new DocumentsController(
      { getByUserId: jest.fn(() => ({ id: 's' })) } as never,
      documents as never,
      versions as never,
      storage as never,
      { extract } as never,
    );
    return { ctrl, storage, documents, versions, extract };
  }

  it('a file Plato cannot read changes nothing and costs no replacement', async () => {
    const { ctrl, storage, documents, versions } = setup({ fails: true });
    await expect(ctrl.replace(req, D1, pdf())).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(documents.update).not.toHaveBeenCalled();
    expect(versions.incrementReplacementCount).not.toHaveBeenCalled();
  });

  it('a good file: new text, no stale error, the apply cache cleared, the old file deleted after', async () => {
    const { ctrl, storage, documents, versions } = setup({ used: 1 });
    const r = await ctrl.replace(req, D1, pdf());
    expect(documents.update).toHaveBeenCalledWith(
      D1,
      expect.objectContaining({
        status: 'READY',
        storage_key: 'new-key',
        extracted_text: 'new text',
        processing_error: null,
        apply_json: null,
      }),
    );
    expect(storage.delete).toHaveBeenCalledWith('old-key');
    expect(versions.incrementReplacementCount).toHaveBeenCalled();
    expect(r.remaining_replacements).toBe(1);
    expect(r).not.toHaveProperty('extracted_text');
    expect(r).not.toHaveProperty('storage_key');
  });

  it('at the limit: refused with what to do; a failed document is replaced for free', async () => {
    await expect(
      setup({ used: 3 }).ctrl.replace(req, D1, pdf()),
    ).rejects.toBeInstanceOf(ConflictException);
    const failed = setup({ used: 3, status: 'FAILED' });
    await failed.ctrl.replace(req, D1, pdf());
    expect(failed.versions.incrementReplacementCount).not.toHaveBeenCalled();
  });

  it('a second CV posted to the same batch is a replacement, not a second CV', async () => {
    const { ctrl, documents, versions } = setup();
    await ctrl.upload(req, pdf(), 'CV_RESUME');
    expect(versions.incrementReplacementCount).toHaveBeenCalled();
    expect(documents.update).toHaveBeenCalledWith(
      D1,
      expect.objectContaining({ storage_key: 'new-key' }),
    );
  });

  it('an Arabic file name arrives as sent', async () => {
    const { ctrl, documents } = setup();
    const name = Buffer.from('سيرة.pdf', 'utf8').toString('latin1');
    await ctrl.replace(req, D1, pdf(name));
    expect(documents.update).toHaveBeenCalledWith(
      D1,
      expect.objectContaining({ name: 'سيرة.pdf' }),
    );
  });

  it('a malformed id is 404, not 500', async () => {
    const { ctrl, documents } = setup();
    await expect(ctrl.remove(req, 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(documents.findById).not.toHaveBeenCalled();
  });

  it('deleting the CV retires the older ones, so it never comes back, then erases them', async () => {
    const { ctrl, documents } = setup();
    await ctrl.remove(req, D1);
    expect(documents.retireOtherCvs).toHaveBeenCalledWith('s', 'v1');
    expect(documents.purgeRetiredCvs).toHaveBeenCalledWith('s');
    expect(documents.retireOtherCvs.mock.invocationCallOrder[0]).toBeLessThan(
      documents.purgeRetiredCvs.mock.invocationCallOrder[0],
    );
  });
});

describe('checkFile: what each tile accepts', () => {
  const file = (name: string, mimetype: string) =>
    ({ originalname: name, mimetype }) as Express.Multer.File;
  it('a passport photo is fine; a CV photo is not; .doc never', () => {
    expect(checkFile(file('id.jpg', 'image/jpeg'), 'ID_DOCUMENT')).toBe(true);
    expect(checkFile(file('cv.pdf', 'application/pdf'), 'CV_RESUME')).toBe(
      false,
    );
    expect(() => checkFile(file('cv.png', 'image/png'), 'CV_RESUME')).toThrow(
      BadRequestException,
    );
    expect(() =>
      checkFile(file('cv.doc', 'application/msword'), 'CV_RESUME'),
    ).toThrow(BadRequestException);
  });
});
