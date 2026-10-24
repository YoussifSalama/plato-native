// A CV the seeker attaches in the Career chat. Its text is appended to their
// message for the model only; the chat shows just the file name. It counts as
// the seeker's own words, so facts can be saved from it with the usual quote rule.

export const ATTACH_MAX_CHARS = 10000;

export interface AttachedDoc {
  id: string;
  name: string | null;
  text: string;
}

export const withAttachments = (
  content: string,
  ui: unknown,
  docs: Map<string, AttachedDoc>,
): string => {
  const ids = (
    (ui as { type?: string; documents?: { id: string }[] } | null)?.type ===
    'attachment'
      ? (ui as { documents: { id: string }[] }).documents
      : []
  ).map((d) => d.id);
  const parts = ids
    .map((id) => docs.get(id))
    .filter((d): d is AttachedDoc => !!d)
    .map(
      (d) =>
        `[Attached document "${d.name ?? 'CV'}": the seeker's own CV, text follows]\n${d.text.slice(0, ATTACH_MAX_CHARS)}`,
    );
  return parts.length ? `${content}\n\n${parts.join('\n\n')}` : content;
};
