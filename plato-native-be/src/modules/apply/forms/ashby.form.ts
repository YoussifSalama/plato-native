import { FieldType, FormField, FormSchema } from '../apply.types';
import { URL_LABEL } from './workable.form';

// Ashby's application form is NOT plain-HTTP fetchable: it loads via a
// GraphQL call the page itself makes after rendering
// (POST jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting), captured
// live from a real posting. `loadForm` (adapters/ashby.adapter.ts) drives a
// throwaway page to capture that response instead of fetching a URL.

// Board + job id (a UUID) from any jobs.ashbyhq.com URL we store.
export function ashbyIds(url: string): { board: string; id: string } | null {
  const m = /jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{36})/i.exec(url);
  return m ? { board: decodeURIComponent(m[1]), id: m[2] } : null;
}

export const ashbyApplyUrl = (board: string, id: string) =>
  `https://jobs.ashbyhq.com/${encodeURIComponent(board)}/${id}/application`;

interface AshbyField {
  path: string; // DOM `name`/`id` for simple fields; system fields start with "_systemfield_"
  title: string;
  type: string; // String | Email | Phone | Location | File | Boolean | ValueSelect | MultiValueSelect | LongText | Number | Date | URL
  selectableValues?: { label: string; value: string }[];
}
interface AshbyFieldEntry {
  field: AshbyField;
  isRequired: boolean;
  descriptionHtml?: string | null;
}
interface AshbySection {
  fieldEntries: AshbyFieldEntry[];
}
export interface AshbyApplicationForm {
  sections: AshbySection[];
}

// Confirmed live (real Notion posting): String, Email, Phone, Location,
// File, Boolean, ValueSelect, MultiValueSelect. The rest are ponytail: best
// guesses from Ashby's own naming convention, not yet seen on a real form —
// widen this map if a posting throws an unmapped type.
const TYPES: Record<string, FieldType> = {
  String: 'text',
  Email: 'email',
  Phone: 'phone',
  Location: 'text',
  File: 'file',
  Boolean: 'boolean',
  ValueSelect: 'choice',
  MultiValueSelect: 'multi',
  LongText: 'paragraph',
  Number: 'number',
  Date: 'date',
  URL: 'url',
};

export function normalizeAshbyForm(
  form: AshbyApplicationForm,
  applyUrl: string,
): FormSchema {
  const fields: FormField[] = [];
  for (const section of form.sections) {
    for (const entry of section.fieldEntries) {
      const { field } = entry;
      // The resume is attached as a file by the submitter, not typed in.
      if (field.type === 'File') continue;
      let type = TYPES[field.type];
      if (!type) {
        // Only String/Email/Phone/Location/File/Boolean/ValueSelect/
        // MultiValueSelect are confirmed; the rest are guesses (see above).
        // A required field with an unrecognised type is silently dropped
        // otherwise, and Ashby's own validation error won't say why.
        if (entry.isRequired)
          console.warn(
            `[ashby.form] required field "${field.title}" has an unmapped Ashby type "${field.type}" — dropped from the form, submission will likely fail`,
          );
        continue;
      }
      if (type === 'text' && URL_LABEL.test(field.title)) type = 'url';
      fields.push({
        id: field.path,
        label: field.title.trim(),
        type,
        required: entry.isRequired,
        options: field.selectableValues?.map((v) => v.label),
        hint: entry.descriptionHtml
          ?.replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 400),
      });
    }
  }
  return { source: 'ASHBY', applyUrl, fields };
}
