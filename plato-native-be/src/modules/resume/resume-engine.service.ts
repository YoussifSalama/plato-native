import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';
import { IEnvParams } from '../../types/config/env.types';
import { analyzeJob, writeResume } from './resume-ai';
import { AtsReport, buildAts, chooseHeadline } from './resume-ats';
import { buildDoc, findGaps, verifyParsedText } from './resume-checks';
import { buildFacts } from './resume-facts';
import { resumePdf } from './resume-render';
import { ResumeProfileService } from './resume-profile.service';
import {
  decideStrategy,
  marketFromCountry,
  needsMarketPreference,
  stageOf,
} from './resume-strategy';
import {
  Check,
  Market,
  ResumeDoc,
  ResumeStrategy,
  TemplateId,
} from './resume.types';

export interface BuildInput {
  jobSeekerId: string;
  // interactive: the Career chat, which can ask. auto: auto-apply, which never asks.
  mode: 'interactive' | 'auto';
  targetRole: string | null;
  jobDescription: string | null;
  // Where the job is (ISO). Decides the market unless `market` is given.
  jobCountry?: string | null;
  market?: Market;
  template?: TemplateId;
  careerChanger?: boolean;
  // Skills confirmed for this build only (e.g. answered on one application).
  confirmedSkills?: string[];
  // The seeker was asked about the gaps and chose to go on without them.
  ignoreGaps?: boolean;
}

export type BuildResult =
  | {
      status: 'built';
      pdf: Buffer;
      doc: ResumeDoc;
      strategy: ResumeStrategy;
      checks: Check[];
      // Keyword coverage against the posting; null when there is none.
      ats: AtsReport | null;
      // Required skills left off because nothing shows them (when set aside).
      gaps: string[];
    }
  | { status: 'needs_input'; kind: 'skill_gaps'; gaps: string[] }
  | { status: 'needs_input'; kind: 'market_preference'; market: Market };

async function parsePdf(pdf: Buffer) {
  const parser = new PDFParse({ data: pdf });
  try {
    const r = await parser.getText();
    return {
      text: r.pages.map((p) => p.text).join('\n'),
      pages: r.pages.length,
    };
  } finally {
    await parser.destroy();
  }
}

// One engine for the Career chat and for auto-apply. Rules in code, the model
// only reads and words, and every claim passes the gate before it is printed.
@Injectable()
export class ResumeEngine {
  private readonly logger = new Logger(ResumeEngine.name);
  private readonly env: IEnvParams;

  constructor(
    private readonly profiles: ResumeProfileService,
    config: ConfigService,
  ) {
    this.env = config.get<IEnvParams>('env')!;
  }

  // Draw the PDF, re-read it like a parser, and tighten once if it runs long.
  // Also used to redraw a resume the seeker edited by hand.
  async render(
    doc: ResumeDoc,
    strategy: Pick<ResumeStrategy, 'maxPages'>,
  ): Promise<{ pdf: Buffer; checks: Check[] }> {
    let pdf = await resumePdf(doc, this.env.applyBrowserChannel);
    let parsed = await parsePdf(pdf);
    if (parsed.pages > strategy.maxPages) {
      doc.compact = true;
      pdf = await resumePdf(doc, this.env.applyBrowserChannel);
      parsed = await parsePdf(pdf);
    }
    return {
      pdf,
      checks: [
        ...verifyParsedText(parsed.text, doc),
        {
          name: 'page_limit',
          ok: parsed.pages <= strategy.maxPages,
          detail: `${parsed.pages} of ${strategy.maxPages} pages`,
        },
      ],
    };
  }

  // A fresh draft of the wording for one stored resume, gated like any build.
  // The caller takes just the summary or bullets it asked about.
  async suggest(input: {
    jobSeekerId: string;
    targetRole: string | null;
    jobDescription: string | null;
    strategy: ResumeStrategy;
    note: string;
  }): Promise<ResumeDoc> {
    const profile = await this.profiles.load(input.jobSeekerId);
    const job = input.jobDescription
      ? await analyzeJob(this.env.applyResumeModel, {
          title: input.targetRole ?? profile.headline ?? 'Role',
          company: '',
          description: input.jobDescription,
        })
      : null;
    const gaps = job ? findGaps(job.required, profile, []) : [];
    const facts = buildFacts(profile);
    const written = await writeResume(this.env.applyResumeModel, {
      profile,
      facts,
      strategy: input.strategy,
      targetRole: input.targetRole,
      job: job && {
        required: job.required,
        preferred: job.preferred,
        keywords: job.keywords,
      },
      note: input.note,
    });
    const headline = chooseHeadline(profile, input.targetRole, []);
    return buildDoc(written, profile, facts, input.strategy, gaps, [], {
      headline: headline.text,
      terms: job ? [...job.required, ...job.preferred, ...job.keywords] : [],
    }).doc;
  }

  async build(input: BuildInput): Promise<BuildResult> {
    const profile = await this.profiles.load(input.jobSeekerId);
    const market =
      input.market ?? marketFromCountry(input.jobCountry ?? profile.country);
    const interactive = input.mode === 'interactive';

    // Egypt is a product default, not a known rule: ask once (chat only).
    if (interactive && needsMarketPreference(market, profile.marketOverrides))
      return { status: 'needs_input', kind: 'market_preference', market };

    const strategy = decideStrategy({
      market,
      stage: stageOf(profile.totalYears),
      careerChanger: input.careerChanger,
      // Auto-apply always uses the safest template.
      template: interactive ? input.template : 'classic',
      overrides: profile.marketOverrides,
    });

    const confirmed = input.confirmedSkills ?? [];
    const job = input.jobDescription
      ? await analyzeJob(this.env.applyResumeModel, {
          title: input.targetRole ?? profile.headline ?? 'Role',
          company: '',
          description: input.jobDescription,
        })
      : null;
    const gaps = job ? findGaps(job.required, profile, confirmed) : [];
    if (gaps.length && !input.ignoreGaps)
      return { status: 'needs_input', kind: 'skill_gaps', gaps };

    const facts = buildFacts(profile);
    const written = await writeResume(this.env.applyResumeModel, {
      profile,
      facts,
      strategy,
      targetRole: input.targetRole,
      job: job && {
        required: job.required,
        preferred: job.preferred,
        keywords: job.keywords,
      },
    });
    const headline = chooseHeadline(profile, input.targetRole, confirmed);
    const jobTerms = job
      ? [...job.required, ...job.preferred, ...job.keywords]
      : [];
    const { doc, dropped } = buildDoc(
      written,
      profile,
      facts,
      strategy,
      gaps,
      confirmed,
      { headline: headline.text, terms: jobTerms },
    );
    const ats = buildAts(doc, headline, job);

    const { pdf, checks: renderChecks } = await this.render(doc, strategy);
    const checks: Check[] = [
      ...renderChecks,
      {
        name: 'claims_gate',
        ok: true,
        detail: `${dropped} unsupported line(s) removed`,
      },
    ];
    this.logger.log(
      `Resume built: ${checks.map((c) => `${c.name}=${c.ok}`).join(' ')}`,
    );
    return { status: 'built', pdf, doc, strategy, checks, ats, gaps };
  }
}
