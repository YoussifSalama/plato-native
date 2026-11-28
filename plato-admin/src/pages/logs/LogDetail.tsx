import { Link } from 'react-router';
import { KeyValues, StatusChip } from '../../components/ui';
import { dateTime } from '../../lib/format';
import type { ErrorLog, ExtensionLog } from '../../lib/types';

/** Colour only for meaning: 5xx is ours (danger), 4xx the caller's (warning). */
export function StatusBadge({ status }: { status: number }) {
  if (!status) return <StatusChip tone="neutral">client</StatusChip>;
  return <StatusChip tone={status >= 500 ? 'danger' : status >= 400 ? 'warning' : 'neutral'}>{status}</StatusChip>;
}

export function SourceChip({ source }: { source: ExtensionLog['source'] }) {
  const label = source === 'client' ? 'Extension' : source === 'apply' ? 'Apply run' : 'API';
  return <span className="chip-neutral">{label}</span>;
}

/** The expanded row: why it happened, who, and the redacted request data. */
export function LogDetail({ log }: { log: ErrorLog | ExtensionLog }) {
  return (
    <div className="grid gap-4 pt-3 lg:grid-cols-2">
      <KeyValues
        rows={[
          ['Why', log.explanation ?? '—'],
          ['Message', log.message],
          ['Code', log.code ? <span className="font-mono text-xs">{log.code}</span> : '—'],
          ['Request', <span className="font-mono text-xs break-all">{`${log.method} ${log.path}`}</span>],
          ['Page', log.page ?? '—'],
          ['Module', log.module],
          [
            'User',
            log.userId ? (
              <Link className="text-primary hover:underline" to={`/users/${log.userId}`}>
                {log.userEmail ?? log.userId}
              </Link>
            ) : (
              (log.userEmail ?? '—')
            ),
          ],
          ['IP', log.ip ?? '—'],
          ['Browser', log.userAgent ? <span className="text-xs break-all">{log.userAgent}</span> : '—'],
          ['Time', dateTime(log.createdAt)],
        ]}
      />
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold text-text-secondary">Data (secrets removed)</p>
        <pre className="max-h-80 overflow-auto rounded-lg border border-divider bg-card p-3 text-xs break-all whitespace-pre-wrap">
          {log.data === undefined || log.data === null ? '—' : JSON.stringify(log.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
