// The extension token lives in chrome.storage.local, restricted to trusted
// extension contexts (service worker, side panel). Content scripts cannot read
// it. This is NOT encryption: the value is plaintext in the browser profile.
const KEY = 'plato.token';

export interface StorageAreaLike {
  setAccessLevel(o: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void> | void;
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export class UntrustedStorageError extends Error {}

export function createTokenStore(area: StorageAreaLike) {
  let trusted: Promise<void> | null = null;
  // Fail closed: if the access level can't be set, the token is never touched.
  const ensureTrusted = () =>
    (trusted ??= Promise.resolve(area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })).catch(() => {
      trusted = null;
      throw new UntrustedStorageError('Cannot restrict storage to trusted contexts');
    }));
  return {
    ensureTrusted,
    async get(): Promise<string | null> {
      await ensureTrusted();
      const v = (await area.get(KEY))[KEY];
      return typeof v === 'string' ? v : null;
    },
    async set(token: string) {
      await ensureTrusted();
      await area.set({ [KEY]: token });
    },
    async clear() {
      await ensureTrusted();
      await area.remove(KEY);
    },
  };
}
export type TokenStore = ReturnType<typeof createTokenStore>;
