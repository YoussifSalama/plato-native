import { api, type Query } from './api';

export type CsvColumn<T> = [header: string, value: (row: T) => unknown];

/** One CSV cell: quoted when it has a comma, quote or line break; dates as ISO; objects as JSON. */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // a leading = + - @ would run as a formula in Excel: neutralise it
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map(([h]) => cell(h)).join(',')];
  for (const r of rows) lines.push(columns.map(([, f]) => cell(f(r))).join(','));
  // the BOM makes Excel read UTF-8 (Arabic names) correctly
  return `﻿${lines.join('\r\n')}\r\n`;
}

export const MAX_EXPORT_ROWS = 10_000;

/** Every page of a list endpoint ({ items, total }, 50 a page) with the same filters, up to MAX_EXPORT_ROWS. */
export async function fetchAll<T>(path: string, query: Query = {}, onProgress?: (n: number, total: number) => void): Promise<{ rows: T[]; total: number }> {
  const rows: T[] = [];
  let total = 0;
  for (let page = 1; rows.length < MAX_EXPORT_ROWS; page++) {
    const r = await api<{ items: T[]; total: number } | T[]>(path, { query: { ...query, page } });
    // a plain array (rate limits): one page holds everything
    if (Array.isArray(r)) return { rows: r.slice(0, MAX_EXPORT_ROWS), total: r.length };
    rows.push(...r.items);
    total = r.total;
    onProgress?.(rows.length, total);
    if (!r.items.length || rows.length >= total) break;
  }
  return { rows: rows.slice(0, MAX_EXPORT_ROWS), total };
}

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
