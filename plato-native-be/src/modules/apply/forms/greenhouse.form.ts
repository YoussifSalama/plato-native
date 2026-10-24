import { FieldType, FormField, FormSchema } from '../apply.types';
import { URL_LABEL } from './workable.form';

// Greenhouse publishes every job's application form as JSON:
//   GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?questions=true
// Each question has one or more `fields`; the field `name` is also the DOM
// id on the hosted form (e.g. first_name, question_69024585). The embeddable
// form works for every board, including companies whose job pages live on
// their own careers domain:
//   https://job-boards.greenhouse.io/embed/job_app?for={board}&token={id}

export const greenhouseApplyUrl = (board: string, id: string) =>
  `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(board)}&token=${id}`;

// Board + job id from any Greenhouse URL we store.
export function greenhouseIds(
  url: string,
): { board: string; id: string } | null {
  const embed = /greenhouse\.io\/embed\/job_app\?(.*)$/i.exec(url);
  if (embed) {
    const q = new URLSearchParams(embed[1]);
    const board = q.get('for');
    const id = q.get('token');
    return board && id ? { board, id } : null;
  }
  const hosted =
    /(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i.exec(url);
  return hosted ? { board: hosted[1], id: hosted[2] } : null;
}

interface GhField {
  name: string;
  type: string;
  values?: { label: string; value: number | string }[];
}
interface GhQuestion {
  label: string;
  required?: boolean;
  fields?: GhField[];
}
export interface GreenhouseJobForm {
  questions?: GhQuestion[];
  location_questions?: GhQuestion[];
  // EEOC self-identification (race, gender, veteran status) — a separate
  // block some boards use instead of inlining them into `questions`.
  compliance?: { type?: string; questions?: GhQuestion[] }[];
  // A flag, not field data: the School/Degree/Discipline inputs it triggers
  // only exist in the hosted form's own DOM, never in this JSON.
  education?: 'education_required' | 'education_optional' | null;
  data_compliance?: {
    type?: string;
    requires_consent?: boolean;
    requires_processing_consent?: boolean;
  }[];
}

const TYPES: Record<string, FieldType> = {
  input_text: 'text',
  textarea: 'paragraph',
  multi_value_single_select: 'choice',
  multi_value_multi_select: 'multi',
  input_boolean: 'boolean',
};

export function normalizeGreenhouseForm(
  job: GreenhouseJobForm,
  applyUrl: string,
): FormSchema {
  const fields: FormField[] = [];
  for (const q of [
    ...(job.questions ?? []),
    ...(job.location_questions ?? []),
    ...(job.compliance ?? []).flatMap((c) => c.questions ?? []),
  ]) {
    const qFields = q.fields ?? [];
    // The resume is attached as a file by the submitter.
    if (qFields.some((f) => f.name === 'resume')) continue;
    // Cover letter: a file OR typed text. Plato writes the text version.
    const f =
      qFields.find((x) => x.name === 'cover_letter_text') ??
      qFields.find((x) => x.type !== 'input_hidden' && x.type !== 'input_file');
    if (!f) continue;
    let type = TYPES[f.type];
    if (!type) continue;
    if (type === 'text' && URL_LABEL.test(q.label)) type = 'url';
    if (f.name === 'email') type = 'email';
    if (f.name === 'phone') type = 'phone';
    const options = f.values?.map((v) => v.label).filter(Boolean);
    fields.push({
      id: f.name,
      label: q.label.trim(),
      type,
      required: !!q.required,
      options: options?.length ? options : undefined,
    });
  }
  // The hosted form asks the phone's country as a combobox; not in the JSON.
  fields.push({ id: 'country', label: 'Country', type: 'text', required: true });
  // Same story as `country`: the JSON only says a school/degree/discipline
  // row exists (`education`), never the DOM ids the hosted form renders
  // (`school--0`/`degree--0`/`discipline--0`). One row only — "Add another"
  // for a second entry is skipped (ponytail: add when an employer needs it).
  if (job.education) {
    const required = job.education === 'education_required';
    fields.push(
      { id: 'school--0', label: 'School', type: 'text', required: false },
      { id: 'degree--0', label: 'Degree', type: 'text', required },
      { id: 'discipline--0', label: 'Discipline', type: 'text', required: false },
    );
  }
  // GDPR: consenting to the processing of this application is applying
  // itself (the answer rule lives in answer-mapper, not here).
  if (job.data_compliance?.some((d) => d.requires_processing_consent))
    fields.push({
      id: 'gdpr_processing_consent_given',
      label:
        'I consent to the processing of my personal data for this recruitment process',
      type: 'boolean',
      required: true,
    });
  return { source: 'GREENHOUSE', applyUrl, fields };
}
