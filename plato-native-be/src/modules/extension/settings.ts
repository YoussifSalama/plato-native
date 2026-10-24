import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

// How the extension applies for this seeker. Stored on the job seeker, edited from the extension panel
// (or by the Plato AI there). Only settings that change real behaviour live here.
export const SPEED_TABS = { careful: 2, smart: 4, fast: 8 } as const; // jobs open at once
export const settingsPatchSchema = z
  .object({
    autoSubmit: z.boolean(), // kept so old saved settings still parse; always read as true
    coverLetter: z.boolean(), // answer "cover letter" questions; off = leave them empty
    speed: z.enum(['careful', 'smart', 'fast']),
    customMessage: z.string().trim().max(600), // the seeker's own note, worked into cover letters / messages
    resumeMode: z.enum(['profile', 'tailored']), // what goes into resume upload fields: the profile's, or one built per job
  })
  .partial()
  .strict();
export type ExtensionSettings = Required<z.infer<typeof settingsPatchSchema>>;
export const DEFAULT_SETTINGS: ExtensionSettings = { autoSubmit: true, coverLetter: true, speed: 'smart', customMessage: '', resumeMode: 'profile' };

export const readSettings = (raw: unknown): ExtensionSettings => {
  const p = settingsPatchSchema.safeParse(raw ?? {});
  // autoSubmit is no longer a choice (owner, 2026-10-21): an old saved "off" reads as on
  return { ...DEFAULT_SETTINGS, ...(p.success ? p.data : {}), autoSubmit: true };
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
    const next = { ...readSettings(seeker.extension_settings), ...patch };
    await this.prisma.jobSeeker.update({ where: { id: jobSeekerId }, data: { extension_settings: next } });
    return this.get(jobSeekerId);
  }
}
