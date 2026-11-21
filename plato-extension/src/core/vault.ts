// Job-site passwords the extension made for the seeker (owner, 2026-11-21). Made here, encrypted here, kept here:
// nothing of a password ever leaves this browser. Plato's backend gets only a reference (ref + host), and the AI
// never sees one (it types a placeholder the executor swaps: v3/executor.ts).
//
// - AES-GCM 256: confidentiality plus a tag, so a tampered entry fails to decrypt instead of giving a wrong password.
// - The key is generated in this browser with extractable: false. It is stored as a CryptoKey object in this
//   extension's IndexedDB: code can use it, nothing can read its bytes out. Content scripts and websites cannot
//   open this database (it belongs to the extension's origin).
// - A fresh random 12-byte IV per encryption.
// Ceiling: anyone (or any malware) using this unlocked Chrome profile can use the key, like any password manager.
// Uninstalling the extension or clearing its data loses the passwords: the seeker uses the site's "Forgot password".

const DB = 'plato-vault';
const KEYS = 'keys';
const ACCOUNTS = 'accounts';

export interface VaultEntry {
  host: string;
  ref: string; // what Plato's backend stores
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
  createdAt: number;
}

// ---- pure parts (tested without a browser) ----

const SETS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%*?'];
/** 16 characters, at least one of each set: passes almost every site's rules (most cap at 16-20 and want all four). */
export function makePassword(len = 16): string {
  const all = SETS.join('');
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0]! % s.length]!;
  const chars = [...SETS.map(pick), ...Array.from({ length: len - SETS.length }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
export const newKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
export async function seal(key: CryptoKey, password: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, ct: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(password)) };
}
export const open = async (key: CryptoKey, iv: Uint8Array<ArrayBuffer>, ct: ArrayBuffer) => new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));

// ---- IndexedDB ----

const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));
const db = () => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore(KEYS);
    r.result.createObjectStore(ACCOUNTS, { keyPath: 'host' });
  };
  return req(r);
};
const store = async (name: string, mode: IDBTransactionMode) => (await db()).transaction(name, mode).objectStore(name);

async function key(): Promise<CryptoKey> {
  const k = await req((await store(KEYS, 'readonly')).get('k'));
  if (k) return k as CryptoKey;
  const made = await newKey();
  await req((await store(KEYS, 'readwrite')).put(made, 'k'));
  return made;
}

/** The saved password for this site, or null. ponytail: one account per site per browser (keyed by host). */
export async function savedPassword(host: string): Promise<string | null> {
  const e = (await req((await store(ACCOUNTS, 'readonly')).get(host))) as VaultEntry | undefined;
  return e ? open(await key(), e.iv, e.ct) : null;
}

/**
 * A password for a new account on this site. One that already exists for the site is reused (the confirm box, a
 * second try after the site refused the form), so a working password is never overwritten. `created` = a new entry.
 */
export async function newPassword(host: string): Promise<{ password: string; ref: string; created: boolean }> {
  const existing = (await req((await store(ACCOUNTS, 'readonly')).get(host))) as VaultEntry | undefined;
  if (existing) return { password: await open(await key(), existing.iv, existing.ct), ref: existing.ref, created: false };
  const password = makePassword();
  const { iv, ct } = await seal(await key(), password);
  const entry: VaultEntry = { host, ref: crypto.randomUUID(), iv, ct, createdAt: Date.now() };
  await req((await store(ACCOUNTS, 'readwrite')).put(entry));
  return { password, ref: entry.ref, created: true };
}

/** The seeker turned the setting off: every saved password in this browser goes. */
export async function wipeVault(): Promise<void> {
  await req((await store(ACCOUNTS, 'readwrite')).clear());
}
