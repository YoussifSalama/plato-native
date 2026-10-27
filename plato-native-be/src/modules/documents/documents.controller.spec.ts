import { NotFoundException } from '@nestjs/common';

// @nestjs/config and @nestjs/jwt ship as ESM, which this Jest setup does not load; neither runs here.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

import { DocumentsController } from './documents.controller';

describe('DocumentsController: a seeker touches only their own documents', () => {
  const doc = {
    id: 'd1',
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

  it("someone else's document: replace and delete answer 404 and change nothing", async () => {
    const { ctrl, storage, documents } = setup('attacker');
    await expect(ctrl.replace(req, 'd1', file)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(ctrl.remove(req, 'd1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(documents.update).not.toHaveBeenCalled();
    expect(documents.remove).not.toHaveBeenCalled();
  });

  it('their own document: delete works', async () => {
    const { ctrl, storage, documents } = setup('victim');
    await ctrl.remove(req, 'd1');
    expect(storage.delete).toHaveBeenCalledWith('k1');
    expect(documents.remove).toHaveBeenCalledWith('d1');
  });
});
