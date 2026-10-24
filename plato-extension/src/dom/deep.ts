// LinkedIn (and others) render dialogs inside OPEN shadow roots, which document.querySelectorAll
// cannot see. These helpers read the page the way a person sees it: the document plus every open
// shadow root inside it. Read-only; closed shadow roots stay invisible by design.
export function deepQueryAll<T extends Element = Element>(root: ParentNode, selector: string, limit = 5000): T[] {
  const out: T[] = [];
  const seen = new Set<ParentNode>();
  const walk = (r: ParentNode) => {
    if (seen.has(r) || out.length >= limit) return;
    seen.add(r);
    out.push(...Array.from(r.querySelectorAll<T>(selector)));
    for (const el of Array.from(r.querySelectorAll('*'))) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(root);
  return out;
}

/** The text a person would read in this subtree, including open shadow roots. */
export function deepText(root: ParentNode, max = 4000): string {
  let s = '';
  const walk = (n: Node) => {
    if (s.length >= max) return;
    if (n.nodeType === 3) s += ` ${n.nodeValue ?? ''}`;
    else if (n.nodeType === 1 || n.nodeType === 11) {
      const el = n as Element;
      if (el.nodeType === 1 && /^(script|style|noscript|svg)$/i.test(el.tagName)) return;
      if ((el as Element).shadowRoot) walk((el as Element).shadowRoot!);
      n.childNodes.forEach(walk);
    }
  };
  walk(root as Node);
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Anything that behaves like a modal dialog, whatever the site calls it. */
export const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open], .artdeco-modal, [class*="modal" i][class*="content" i]';
