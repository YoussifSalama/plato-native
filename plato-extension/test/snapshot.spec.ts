// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { pressRef, takeSnapshot } from '../src/dom/snapshot';

const page = (html: string) => (document.body.innerHTML = html);

describe('page snapshot for the AI planner', () => {
  it('lists the controls and field counts of the open dialog, never field values', () => {
    page('<main><button>Save</button></main><div role="dialog"><h2>Contact info</h2><label for="p">Phone</label><input id="p" value="0100SECRET"><button>Back</button><button aria-label="Continue to next step">Next</button></div>');
    const s = takeSnapshot(document);
    expect(s).toMatchObject({ dialogOpen: true, dialogTitle: 'Contact info', fields: { total: 1, empty: 0 } });
    expect(s.elements.map((e) => e.label)).toEqual(['Back', 'Continue to next step']); // the dialog's, not the page behind it
    expect(JSON.stringify(s)).not.toContain('SECRET');
  });

  it('sees a dialog inside an open shadow root', () => {
    page('<div id="host"></div>');
    document.getElementById('host')!.attachShadow({ mode: 'open' }).innerHTML = '<div role="dialog"><h2>Apply</h2><input><button>Review</button></div>';
    const s = takeSnapshot(document);
    expect(s.dialogOpen).toBe(true);
    expect(s.elements.map((e) => e.label)).toEqual(['Review']);
    expect(s.fields).toEqual({ total: 1, empty: 1 });
  });

  it('presses only a ref from the latest snapshot, never a denied control', () => {
    page('<div role="dialog"><button id="n">Next</button><button id="d">Discard</button><button id="f">Follow company</button></div>');
    const clicks = vi.fn();
    document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => clicks(b.id)));
    const s = takeSnapshot(document);
    const ref = (label: string) => s.elements.find((e) => e.label === label)!.ref;
    expect(pressRef(document, ref('Discard'))).toEqual({ clicked: false, reason: 'not-allowed' });
    expect(pressRef(document, ref('Follow company'))).toEqual({ clicked: false, reason: 'not-allowed' });
    expect(pressRef(document, 'e99')).toEqual({ clicked: false, reason: 'unknown-ref' });
    expect(pressRef(document, ref('Next'))).toEqual({ clicked: true });
    expect(clicks.mock.calls).toEqual([['n']]);
  });
});
