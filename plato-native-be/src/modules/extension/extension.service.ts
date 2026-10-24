import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ABSOLUTE_TTL_MS,
  formatCode,
  IDLE_TTL_MS,
  MAX_DEVICES,
  newPairingCode,
  newToken,
  normalizeCode,
  PAIRING_TTL_MS,
  SCOPES,
  sha256,
  TOKEN_RE,
} from './extension-token';

export interface ExtensionPrincipal {
  deviceId: string;
  jobSeekerId: string;
  scopes: string[];
}

const OBJECT_ID = /^[0-9a-f]{24}$/;
// Slide the idle window at most once a minute: no write on every request.
const TOUCH_EVERY_MS = 15_000; // "online" in the web app (90 s window) needs a fresh last_used_at

@Injectable()
export class ExtensionService {
  constructor(private readonly prisma: PrismaService) {}

  async startPairing(jobSeekerId: string) {
    // One pending code per seeker; used/expired ones are cleaned up here.
    await this.prisma.extensionPairing.deleteMany({
      where: {
        job_seeker_id: jobSeekerId,
        OR: [{ used_at: null }, { expires_at: { lt: new Date() } }],
      },
    });
    const code = newPairingCode();
    const expires_at = new Date(Date.now() + PAIRING_TTL_MS);
    await this.prisma.extensionPairing.create({
      data: {
        job_seeker_id: jobSeekerId,
        code_hash: sha256(code),
        expires_at,
        // explicit null: on Mongo a missing field does NOT match `used_at: null`
        used_at: null,
      },
    });
    return { code: formatCode(code), expires_at };
  }

  private activeDevices(jobSeekerId: string) {
    const now = new Date();
    return {
      job_seeker_id: jobSeekerId,
      revoked_at: null,
      expires_at: { gt: now },
      idle_expires_at: { gt: now },
    };
  }

  async exchange(rawCode: string, label: string, extVersion?: string) {
    const now = new Date();
    const pairing = await this.prisma.extensionPairing.findUnique({
      where: { code_hash: sha256(normalizeCode(rawCode)) },
    });
    if (!pairing || pairing.used_at || pairing.expires_at <= now)
      throw new UnauthorizedException('Invalid or expired code');
    const active = await this.prisma.extensionDevice.count({
      where: this.activeDevices(pairing.job_seeker_id),
    });
    if (active >= MAX_DEVICES)
      throw new ConflictException(
        `Device limit reached (${MAX_DEVICES}). Remove one in Plato first.`,
      );
    // Single use, even under a race: only one caller flips used_at.
    const claimed = await this.prisma.extensionPairing.updateMany({
      where: { id: pairing.id, used_at: null },
      data: { used_at: now },
    });
    if (claimed.count !== 1)
      throw new UnauthorizedException('Invalid or expired code');

    const token = newToken();
    const expires_at = new Date(now.getTime() + ABSOLUTE_TTL_MS);
    const device = await this.prisma.extensionDevice.create({
      data: {
        job_seeker_id: pairing.job_seeker_id,
        label,
        ext_version: extVersion,
        token_hash: sha256(token),
        scopes: [...SCOPES],
        last_used_at: now,
        revoked_at: null, // explicit: see startPairing
        idle_expires_at: new Date(now.getTime() + IDLE_TTL_MS),
        expires_at,
      },
    });
    return { token, device_id: device.id, scopes: [...SCOPES], expires_at };
  }

  /** Null for anything that is not a live token. Never throws on bad input. */
  async authenticate(token: string): Promise<ExtensionPrincipal | null> {
    if (!TOKEN_RE.test(token)) return null;
    const d = await this.prisma.extensionDevice.findUnique({
      where: { token_hash: sha256(token) },
    });
    const now = Date.now();
    if (
      !d ||
      d.revoked_at ||
      d.expires_at.getTime() <= now ||
      d.idle_expires_at.getTime() <= now
    )
      return null;
    if (!d.last_used_at || now - d.last_used_at.getTime() > TOUCH_EVERY_MS) {
      const idle = Math.min(now + IDLE_TTL_MS, d.expires_at.getTime());
      await this.prisma.extensionDevice.update({
        where: { id: d.id },
        data: { last_used_at: new Date(now), idle_expires_at: new Date(idle) },
      });
    }
    return {
      deviceId: d.id,
      jobSeekerId: d.job_seeker_id,
      scopes: d.scopes,
    };
  }

  listDevices(jobSeekerId: string) {
    return this.prisma.extensionDevice.findMany({
      where: this.activeDevices(jobSeekerId),
      select: {
        id: true,
        label: true,
        ext_version: true,
        created_at: true,
        last_used_at: true,
        expires_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async revoke(jobSeekerId: string, deviceId: string) {
    if (!OBJECT_ID.test(deviceId)) throw new NotFoundException('Not found');
    const r = await this.prisma.extensionDevice.updateMany({
      where: { id: deviceId, job_seeker_id: jobSeekerId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (r.count !== 1) throw new NotFoundException('Device not found');
    return { revoked: true };
  }

  async revokeAll(jobSeekerId: string) {
    const r = await this.prisma.extensionDevice.updateMany({
      where: { job_seeker_id: jobSeekerId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return { revoked: r.count };
  }
}
