import { FieldType, FormField, FormSchema } from '../apply.types';
import { URL_LABEL } from './workable.form';

// Lever's hosted apply page (jobs.lever.co/{site}/{id}/apply) is one
// server-rendered multipart form, identical across employers:
//   - fixed inputs by `name` (name, email, phone, location, org, urls[...])
//   - custom questions as "cards"; each card ships its full JSON definition
//     in a hidden `cards[{id}][baseTemplate]` input, answers go to
//     `cards[{id}][field{n}]`.
// So the schema is read straight off the HTML; no browser needed.

const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};
const decode = (s: string) =>
  s.replace(/&(quot|amp|lt|gt|#39|#x27|nbsp);/g, (m) => ENTITIES[m] ?? m);

const FIXED: { name: string; label: string; type: FieldType }[] = [
  { name: 'name', label: 'Full name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'phone' },
  { name: 'location', label: 'Current location', type: 'text' },
  { name: 'org', label: 'Current company', type: 'text' },
];

const CARD_TYPES: Record<string, FieldType> = {
  text: 'text',
  textarea: 'paragraph',
  'multiple-choice': 'choice',
  dropdown: 'choice',
  'multiple-select': 'multi',
  university: 'text',
};

interface LeverCardField {
  type: string;
  text?: string;
  required?: boolean;
  options?: { text: string }[];
}

const tagFor = (html: string, name: string) =>
  html.match(
    new RegExp(
      `<(?:input|textarea|select)[^>]*name="${name.replace(/[[\]]/g, '\\$&')}"[^>]*>`,
    ),
  )?.[0];

export function parseLeverForm(html: string, applyUrl: string): FormSchema {
  const fields: FormField[] = [
    { id: 'resume', label: 'Resume', type: 'file', required: true },
  ];

  for (const f of FIXED) {
    const tag = tagFor(html, f.name);
    if (!tag) continue;
    fields.push({
      id: f.name,
      label: f.label,
      type: f.type,
      required: /\brequired\b/.test(tag),
    });
  }

  for (const name of new Set(
    [...html.matchAll(/name="(urls\[[^\]]+\])"/g)].map((m) => m[1]),
  )) {
    const tag = tagFor(html, name) ?? '';
    fields.push({
      id: name,
      label: `${name.slice(5, -1)} URL`,
      type: 'url',
      required: /\brequired\b/.test(tag),
    });
  }

  // Custom question cards.
  for (const m of html.matchAll(
    /<input[^>]*name="cards\[([^\]]+)\]\[baseTemplate\]"[^>]*>/g,
  )) {
    const value = m[0].match(/value="([^"]*)"/)?.[1];
    if (!value) continue;
    let card: { fields?: LeverCardField[] };
    try {
      card = JSON.parse(decode(value)) as { fields?: LeverCardField[] };
    } catch {
      continue;
    }
    (card.fields ?? []).forEach((cf, i) => {
      let type = CARD_TYPES[cf.type];
      if (!type) return; // file-upload etc: not supported, skipped if optional
      if (type === 'text' && URL_LABEL.test(cf.text ?? '')) type = 'url';
      fields.push({
        id: `cards[${m[1]}][field${i}]`,
        label: (cf.text ?? '').trim(),
        type,
        required: !!cf.required,
        options: cf.options?.map((o) => o.text),
      });
    });
  }

  // Consent checkboxes are the seeker's call, never ticked silently.
  for (const name of new Set(
    [...html.matchAll(/name="(consent\[[^\]]+\])"/g)].map((m) => m[1]),
  )) {
    const tag = tagFor(html, name) ?? '';
    fields.push({
      id: name,
      label: `Consent: ${name.slice(8, -1)}`,
      type: 'boolean',
      required: /\brequired\b/.test(tag),
    });
  }

  return { source: 'LEVER', applyUrl, fields };
}

export const leverApplyUrl = (jobUrl: string) =>
  `${jobUrl.replace(/\/(apply)?\/?$/, '')}/apply`;
