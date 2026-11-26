import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../documents/storage.service';
import { TextExtractionService } from '../documents/text-extraction.service';
import {
  CvAnalysisService,
  type CvAnalysis,
} from '../profile-extraction/cv-analysis.service';
import { yearsOf } from './search-review';
import { cvFacts } from './job-seeker-snapshot';

// "Search with a different CV" (New search): a CV read for one search, kept apart from the profile's documents so
// the profile, its CV and onboarding never change. The run carries its id (query.cvId): the search ranks against
// it and applications from that search send it.
@Injectable()
export class SearchCvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly text: TextExtractionService,
    private readonly cvAnalysis: CvAnalysisService,
  ) {}

  async upload(jobSeekerId: string, file: Express.Multer.File) {
    let text: string;
    try {
      text = await this.text.extract(file.buffer, file.mimetype);
    } catch {
      throw new BadRequestException(
        'Plato could not read that file. Try a PDF or Word copy of your CV.',
      );
    }
    if (text.trim().length < 200)
      throw new BadRequestException(
        'That file has almost no text. Upload your CV as a PDF or Word file (not a scan).',
      );
    const analysis = await this.cvAnalysis.analyze(text); // paid (onboarding.extract), like reading the profile's CV
    const key = await this.storage.upload(file, `search-cvs/${jobSeekerId}`);
    const row = await this.prisma.searchCv.create({
      data: {
        job_seeker_id: jobSeekerId,
        name: file.originalname.slice(0, 200),
        storage_key: key,
        text,
        analysis: analysis as unknown as Prisma.InputJsonValue,
      },
    });
    return summary(row);
  }

  /** The seeker's CVs for searches, newest first (to pick one again). */
  async list(jobSeekerId: string) {
    const rows = await this.prisma.searchCv.findMany({
      where: { job_seeker_id: jobSeekerId },
      orderBy: { created_at: 'desc' },
      take: 5,
    });
    return rows.map(summary);
  }
}

// What New search shows for a CV: its name, the roles it shows and the years its dates add up to.
function summary(row: {
  id: string;
  name: string;
  analysis: unknown;
  created_at: Date;
}) {
  const facts = cvFacts((row.analysis as CvAnalysis).extraction);
  return {
    id: row.id,
    name: row.name,
    roles: [...new Set(facts.experiences.map((e) => e.title))].slice(0, 3),
    years: yearsOf({ yearsExperience: null, experiences: facts.experiences }),
    created_at: row.created_at,
  };
}
