import type { Decision } from './types';
import type { TurnRequest, TurnResponse } from '../v3/contract';
import type { RunSettings } from '../panel/ready';
import type { AnswerQuestion, ApiItem, Candidate, ConsentBody, JobFilters, JobsPage, OrchestratorEvent, OrchestratorRequest, PolicyMap, SearchCard, TransitionBody } from './types';

export class ApiError extends Error {
  constructor(
    public status: number, // 0 = network failure
    message: string,
  ) {
    super(message);
  }
}

export interface ApiConfig {
  base: string; // the one Plato API origin the CSP allows
  getToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  timeoutMs?: number; // a hung request (the AI on a bad network) must not hold a job forever
}

// The only network path of the extension. Bearer token, no cookies, only the
// Plato API origin, only /extension/* paths.
export function createApi(cfg: ApiConfig) {
  const doFetch = cfg.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const timeoutMs = cfg.timeoutMs ?? 90_000; // one AI decision on a slow network can take a minute

  async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    if (!path.startsWith('/extension/')) throw new Error('Refusing non-extension path');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = await cfg.getToken();
      if (!token) throw new ApiError(401, 'Not paired');
      headers.Authorization = `Bearer ${token}`;
    }
    let res: Response;
    try {
      res = await doFetch(cfg.base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new ApiError(0, (e as Error)?.name === 'TimeoutError' ? 'Plato did not answer in time' : 'Network error');
    }
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = ((await res.json()) as { message?: string }).message ?? msg;
      } catch {
        /* not json */
      }
      throw new ApiError(res.status, msg);
    }
    return (await res.json()) as T;
  }

  return {
    exchange: (code: string, device_label: string, ext_version: string) =>
      call<{ token: string; device_id: string; scopes: string[]; expires_at: string }>(
        'POST',
        '/extension/pairing/exchange',
        { code, device_label, ext_version },
        false,
      ),
    me: () => call<{ device_id: string; scopes: string[] }>('GET', '/extension/v1/me'),
    policy: () => call<{ providers: PolicyMap; matches: string[]; auto_submit?: string[] }>('GET', '/extension/v1/policy'),
    searches: () => call<SearchCard[]>('GET', '/extension/v1/searches'),
    searchJobs: (id: string, f: JobFilters & { skip?: number; take?: number } = {}) => {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
      return call<JobsPage>('GET', `/extension/v1/searches/${encodeURIComponent(id)}/jobs${qs ? `?${qs}` : ''}`);
    },
    createBatch: (jobIds: string[], searchId?: string) => call<{ batch_id: string | null; items: ApiItem[]; rejected: { job_id: string; reason: string }[] }>('POST', '/extension/v1/apply-batches', { jobIds, ...(searchId && { searchId }) }),
    orchestrate: (body: OrchestratorRequest) => call<{ reply: string; events: OrchestratorEvent[] }>('POST', '/extension/v1/orchestrator', body),
    decide: (itemId: string, body: unknown) => call<Decision>('POST', `/extension/v1/items/${encodeURIComponent(itemId)}/decide`, body),
    // engine v3: one model turn (the backend holds the conversation and the key)
    v3Turn: (itemId: string, body: TurnRequest) => call<TurnResponse>('POST', `/extension/v1/items/${encodeURIComponent(itemId)}/v3/turn`, body),
    resumeChoice: (itemId: string, choice: 'profile' | 'tailored') => call<{ resume_choice: 'profile' | 'tailored' }>('POST', `/extension/v1/items/${encodeURIComponent(itemId)}/resume`, { choice }),
    file: (itemId: string) => call<{ name: string; mime: string; data: string }>('GET', `/extension/v1/items/${encodeURIComponent(itemId)}/file`),
    remember: (entries: { question: string; value: string }[]) => call<{ remembered: number }>('POST', '/extension/v1/answers/remember', { entries }),
    stop: (itemId: string, body: { reason: string; message: string }) => call<{ ok: true }>('POST', `/extension/v1/items/${encodeURIComponent(itemId)}/stops`, body),
    answers: (itemId: string, body: { questions: AnswerQuestion[] }) => call<{ answers: { id: string; value: string | null }[]; aiFailed?: boolean }>('POST', `/extension/v1/items/${encodeURIComponent(itemId)}/answers`, body),
    verifyMapping: (provider: string, formKey: string, version: number) => call<{ verified: boolean }>('POST', `/extension/v1/mappings/${encodeURIComponent(provider)}/${encodeURIComponent(formKey)}/verify`, { version }),
    settings: () => call<RunSettings>('GET', '/extension/v1/settings'),
    saveSettings: (patch: Partial<Pick<RunSettings, 'autoSubmit' | 'coverLetter' | 'speed' | 'customMessage' | 'resumeMode'>>) => call<RunSettings>('POST', '/extension/v1/settings', patch),
    queue: () => call<{ id: string; company: string; title: string; match: number }[]>('GET', '/extension/v1/queue'),
    dropFromQueue: (itemIds: string[]) => call<{ dropped: number }>('POST', '/extension/v1/queue/drop', { itemIds }),
    clearQueue: () => call<{ cleared: number }>('POST', '/extension/v1/queue/clear', {}),
    consent: (body: ConsentBody) => call<{ ok: true }>('POST', '/extension/v1/consent', body),
    batches: () => call<ApiItem[]>('GET', '/extension/v1/batches'),
    claim: (id: string) => call<ApiItem>('POST', `/extension/v1/items/${id}/claim`, {}),
    heartbeat: (id: string, attempt_id: string) =>
      call<{ ok: true }>('POST', `/extension/v1/items/${id}/heartbeat`, { attempt_id }),
    transition: (id: string, body: TransitionBody) =>
      call<ApiItem>('POST', `/extension/v1/items/${id}/transition`, body),
    // The seeker's identity details for this item (only while this device holds it).
    candidate: (id: string) => call<Candidate>('GET', `/extension/v1/items/${id}/candidate`),
    unpair: () => call<{ revoked: boolean }>('DELETE', '/extension/v1/device'),
  };
}
export type Api = ReturnType<typeof createApi>;
