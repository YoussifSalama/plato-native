import { ForbiddenException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

// How the extension applies for this seeker. Stored on the job seeker, edited from the extension panel
// (or by the Plato AI there). Only settings that change real behaviour live here.
export const SPEED_TABS = { careful: 2, smart: 4, fast: 8 } as const; // jobs open at once
export const settingsPatchSchema = z
  .object({
    autoSubmit: z.boolean(), // kept so old saved settings still parse; always submitMode === 'auto'; a patch's own value is ignored
    // Asked before every batch, the last answer preselected: 'auto' = "Apply for me", 'review' = "Check with me before each Submit"
    submitMode: z.enum(['auto', 'review']),
    coverLetter: z.boolean(), // answer "cover letter" questions; off = leave them empty
    speed: z.enum(['careful', 'smart', 'fast']),
    customMessage: z.string().trim().max(600), // the seeker's own note, worked into cover letters / messages
    resumeMode: z.enum(['profile', 'tailored']), // what goes into resume upload fields: the profile's, or one built per job
    createAccounts: z.boolean(), // the extension may create and sign in to job-site accounts (password made and kept in the browser); off = none, and the saved ones are wiped
  })
  .partial()
  .strict();
export type ExtensionSettings = Required<z.infer<typeof settingsPatchSchema>>;
export const DEFAULT_SETTINGS: ExtensionSettings = { autoSubmit: false, submitMode: 'review', coverLetter: true, speed: 'smart', customMessage: '', resumeMode: 'profile', createAccounts: true }; // createAccounts on by default (owner, 2026-11-23): Plato makes the job-site account itself

export const readSettings = (raw: unknown): ExtensionSettings => {
  const p = settingsPatchSchema.safeParse(raw ?? {});
  const s = { ...DEFAULT_SETTINGS, ...(p.success ? p.data : {}) };
  // every saved settings object holds autoSubmit: true (it was forced on until 2026-11-26): only submitMode decides
  return { ...s, autoSubmit: s.submitMode === 'auto' };
};

@Injectable()
export class ExtensionSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(jobSeekerId: string) {
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({ where: { id: jobSeekerId }, select: { extension_settings: true } });
    // The resume an application uses: the approved one, else the newest Plato built, else the uploaded CV.
    const resume =
      (await this.prisma.careerResume.findFirst({ where: { job_seeker_id: jobSeekerId, approved: true }, orderBy: { created_at: 'desc' }, select: { title: true, version: true } })) ??
      (await this.prisma.careerResume.findFirst({ where: { job_seeker_id: jobSeekerId }, orderBy: { created_at: 'desc' }, select: { title: true, version: true } }));
    const cv = resume ? null : await this.prisma.jobSeekerDocument.findFirst({ where: { job_seeker_id: jobSeekerId, type: 'CV_RESUME', status: 'READY' }, select: { name: true } });
    const s = readSettings(seeker.extension_settings);
    return {
      ...s,
      tabs: SPEED_TABS[s.speed],
      resume: resume ? `${resume.title} (v${resume.version})` : (cv?.name ?? null),
    };
  }

  async put(jobSeekerId: string, patch: z.infer<typeof settingsPatchSchema>) {
    const seeker = await this.prisma.jobSeeker.findUniqueOrThrow({ where: { id: jobSeekerId }, select: { extension_settings: true } });
    const merged = { ...readSettings(seeker.extension_settings), ...patch };
    const next = { ...merged, autoSubmit: merged.submitMode === 'auto' };
    await this.prisma.jobSeeker.update({ where: { id: jobSeekerId }, data: { extension_settings: next } });
    // off: the references go now; each browser wipes its own passwords the next time the extension reads its settings
    if (patch.createAccounts === false) await this.prisma.extensionSiteAccount.deleteMany({ where: { job_seeker_id: jobSeekerId } });
    return this.get(jobSeekerId);
  }

  /** The job-site accounts the extension created, with the browser that holds each password (never the password). */
  async siteAccounts(jobSeekerId: string) {
    const rows = await this.prisma.extensionSiteAccount.findMany({ where: { job_seeker_id: jobSeekerId }, orderBy: { created_at: 'desc' }, take: 200 });
    const devices = await this.prisma.extensionDevice.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.device_id))] } }, select: { id: true, label: true, revoked_at: true } });
    const byId = new Map(devices.map((d) => [d.id, d]));
    return rows.map((r) => ({ id: r.id, host: r.host, browser: r.browser, device: byId.get(r.device_id)?.label ?? null, device_linked: !!byId.get(r.device_id) && !byId.get(r.device_id)!.revoked_at, created_at: r.created_at }));
  }

  /** The extension made an account: keep its reference. Refused while the seeker has the setting off. */
  async addSiteAccount(jobSeekerId: string, deviceId: string, a: z.infer<typeof siteAccountSchema>) {
    const s = await this.prisma.jobSeeker.findUniqueOrThrow({ where: { id: jobSeekerId }, select: { extension_settings: true } });
    if (!readSettings(s.extension_settings).createAccounts) throw new ForbiddenException('Creating site accounts is off');
    await this.prisma.extensionSiteAccount.upsert({ where: { ref: a.ref }, create: { job_seeker_id: jobSeekerId, device_id: deviceId, ...a }, update: { host: a.host, browser: a.browser } });
    return { ok: true };
  }
}

export const siteAccountSchema = z.object({
  ref: z.string().uuid(),
  host: z.string().min(1).max(253).regex(/^[a-z0-9.-]+$/i),
  browser: z.string().min(1).max(80),
});
