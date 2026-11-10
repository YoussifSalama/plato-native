import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { z } from 'zod';
import type { StorageService } from '../documents/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExtensionPrincipal } from './extension.service';
import { DOC_STORAGE } from './resume-file.service';

// Proof of apply: the extension's screenshot of the "application submitted / thank you" page.
// Stored privately and pointed to by JobApplication.evidence.screenshotKey, the same field the
// server worker uses, so GET job-seeker/applications/:id/screenshot serves it to the seeker.

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
// Accepted only shortly after the submit transition: proof belongs to that moment, and a
// paired device can't swap the picture on an old application later. Re-uploads inside the
// window replace the key (idempotent from the application's point of view).
export const PROOF_WINDOW_MS = 15 * 60_000;

export const proofSchema = z.object({
  // base64, with or without a data: URL prefix. ~5 MB of bytes is ~6.7 MB of base64.
  image: z
    .string()
    .min(16)
    .max(Math.ceil((PROOF_MAX_BYTES * 4) / 3) + 64),
  url: z.string().url().max(2048).optional(),
  capturedAt: z.string().datetime().optional(),
});
export type ProofInput = z.infer<typeof proofSchema>;

/** Decode and sniff: PNG or JPEG by magic bytes (the declared type is never trusted). */
export function decodeProofImage(image: string): {
  bytes: Buffer;
  ext: 'png' | 'jpg';
  mime: string;
} {
  const b64 = image.replace(/^data:image\/[a-z]+;base64,/i, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))
    throw new BadRequestException('Image must be base64');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > PROOF_MAX_BYTES)
    throw new PayloadTooLargeException('Screenshot is larger than 5 MB');
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { bytes, ext: 'png', mime: 'image/png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { bytes, ext: 'jpg', mime: 'image/jpeg' };
  throw new BadRequestException('Screenshot must be a PNG or JPEG');
}

const OBJECT_ID = /^[0-9a-f]{24}$/;
const SUBMITTED = ['SUBMITTED_CONFIRMED', 'SUBMITTED_ATTESTED'];

@Injectable()
export class ProofService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOC_STORAGE)
    private readonly storage: Pick<StorageService, 'putBuffer'>,
  ) {}

  async save(
    p: ExtensionPrincipal,
    itemId: string,
    input: ProofInput,
    now = new Date(),
  ) {
    if (!OBJECT_ID.test(itemId)) throw new NotFoundException('Item not found');
    const item = await this.prisma.applyBatchItem.findFirst({
      where: { id: itemId, job_seeker_id: p.jobSeekerId },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (!SUBMITTED.includes(item.state))
      throw new ConflictException(`Item is ${item.state}, not submitted`);
    if (item.device_id !== p.deviceId)
      throw new ConflictException('Submitted from another device');
    const last = (item.detail as { last?: { to?: string; at?: string } } | null)
      ?.last;
    const submittedAt =
      last && SUBMITTED.includes(last.to ?? '') && last.at
        ? Date.parse(last.at)
        : NaN;
    if (!(now.getTime() - submittedAt <= PROOF_WINDOW_MS))
      throw new ConflictException('Too late to attach proof');

    // The item's application: by id when the item carries it, else the (seeker, job) row.
    const app = await this.prisma.jobApplication.findFirst({
      where: item.application_id
        ? { id: item.application_id, job_seeker_id: p.jobSeekerId }
        : { job_seeker_id: p.jobSeekerId, job_id: item.job_id },
      select: { id: true, evidence: true },
    });
    if (!app) throw new NotFoundException('No application for this item');

    const { bytes, ext, mime } = decodeProofImage(input.image);
    const key = `proofs/${p.jobSeekerId}/${app.id}-${now.getTime()}.${ext}`;
    await this.storage.putBuffer(key, bytes, mime);
    const evidence = {
      ...((app.evidence as Record<string, unknown> | null) ?? {}), // merge: marker, confirmed_by... stay
      screenshotKey: key,
      proofUrl: input.url ?? null,
      proofCapturedAt: input.capturedAt ?? now.toISOString(),
    };
    await this.prisma.jobApplication.update({
      where: { id: app.id },
      data: { evidence },
    });
    return { ok: true, screenshotKey: key };
  }
}
