// Proof of apply: right after a submit is recorded, a screenshot of the page that says so (the "application
// submitted / thank you" page) goes to Plato and is shown on the application. Best effort, always: a failed
// capture or upload is logged and the apply flow carries on as if nothing happened.
// Pure over its deps (the chrome calls live in the panel) so the flow is tested without a browser.

export interface ProofShot {
  data: string; // base64 JPEG or PNG, no data: prefix needed
  url?: string;
}
export interface ProofBody {
  image: string;
  url?: string;
  capturedAt: string;
}
export interface ProofDeps {
  capture(tabId: number): Promise<ProofShot | null>; // brings the tab forward and shoots it
  upload(itemId: string, body: ProofBody): Promise<unknown>;
  log(message: string): void;
  now?: () => Date;
  captureCapMs?: number;
}

export const PROOF_CAPTURE_CAP_MS = 6000;

/**
 * Captures now (the page must still show the confirmation), bounded by a time cap; the upload then runs in the
 * background. Resolves after the capture with `uploaded`, which settles to true/false and never rejects.
 */
export async function captureProof(d: ProofDeps, itemId: string, tabId: number | undefined): Promise<{ uploaded: Promise<boolean> }> {
  const done = (ok: boolean) => ({ uploaded: Promise.resolve(ok) });
  if (tabId === undefined) return done(false);
  let shot: ProofShot | null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    shot = await Promise.race([
      d.capture(tabId),
      new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error('capture did not answer in time')), d.captureCapMs ?? PROOF_CAPTURE_CAP_MS))),
    ]);
  } catch (e) {
    d.log(`Proof screenshot not taken: ${e instanceof Error ? e.message : String(e)}`);
    return done(false);
  } finally {
    clearTimeout(timer);
  }
  if (!shot?.data) {
    d.log('Proof screenshot not taken: nothing captured.');
    return done(false);
  }
  const body: ProofBody = { image: shot.data.replace(/^data:[^,]*,/, ''), capturedAt: (d.now?.() ?? new Date()).toISOString(), ...(shot.url && /^https?:\/\//i.test(shot.url) && { url: shot.url.slice(0, 2048) }) };
  const uploaded = Promise.resolve()
    .then(() => d.upload(itemId, body))
    .then(
      () => true,
      (e) => {
        d.log(`Proof screenshot not saved: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      },
    );
  return { uploaded };
}
