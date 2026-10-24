import { FieldType, FormField, FormSchema } from '../apply.types';

// Workable's job board exposes the application form as JSON:
//   GET https://jobs.workable.com/api/v1/jobs/{id}/form
// Sections of fields with id / type / required. Standard ids (firstname,
// lastname, email, phone, address, resume, ...) are stable across employers;
// screening questions come as QA_* / CA_* ids. In the page every control
// carries data-ui="{id}", so the id doubles as the selector.

export const WORKABLE_ORIGIN = 'https://jobs.workable.com';

// The short id lives in the board URL: /view/{shortId}/{slug}
export const workableJobId = (jobUrl: string) =>
  jobUrl.match(/\/view\/([^/?#]+)/)?.[1] ?? null;

// "LinkedIn URL", "GitHub profile link", "Portfolio". Not "share links to
// 1-3 projects" (free text with several links).
export const URL_LABEL =
  /^(please (share|provide) )?(your )?(linkedin|github|gitlab|portfolio|website|behance|dribbble)\b.{0,25}$|\b(url|profile link)\b/i;

const TYPES: Record<string, FieldType> = {
  text: 'text',
  number: 'number',
  date: 'date',
  email: 'email',
  phone: 'phone',
  paragraph: 'paragraph',
  boolean: 'boolean',
  dropdown: 'choice',
  multiple: 'multi',
  file: 'file',
  group: 'group',
};

interface WorkableField {
  id: string;
  label?: string;
  type: string;
  required?: boolean;
  maxLength?: number;
  singleOption?: boolean;
  // Real shape: { name: "539150" (internal id), value: "A few times per week" }.
  options?: { name?: string; value?: string; label?: string; body?: string }[];
  choices?: { name?: string; value?: string; label?: string; body?: string }[];
}

export function normalizeWorkableForm(
  sections: { name?: string; fields?: WorkableField[] }[],
  applyUrl: string,
): FormSchema {
  const fields: FormField[] = [];
  for (const section of sections) {
    for (const f of section.fields ?? []) {
      let type = TYPES[f.type];
      if (!type) continue;
      if (f.type === 'multiple' && f.singleOption) type = 'choice';
      // A text box that asks for a link must get a link, never a sentence.
      if (type === 'text' && URL_LABEL.test(f.label ?? '')) type = 'url';
      const options = (f.options ?? f.choices)
        // The human-readable text is what the page shows and what we click.
        ?.map((o) => o.value ?? o.body ?? o.label ?? o.name ?? '')
        .filter(Boolean);
      fields.push({
        id: f.id,
        label: (f.label ?? f.id).trim(),
        type,
        required: !!f.required,
        options: options?.length ? options : undefined,
        maxLength: f.maxLength,
      });
    }
  }
  return { source: 'WORKABLE', applyUrl, fields };
}
