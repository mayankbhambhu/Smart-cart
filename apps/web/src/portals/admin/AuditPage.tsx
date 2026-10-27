import { type AdminStoreRow, type AuditLogEntry } from '@smartcart/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader, Select, Table, Td, Th } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { formatDateTime, useDebounced } from '@/lib/utils';

const ACTION_LABELS: Record<string, string> = {
  CREDENTIALS_ISSUED: 'Login issued',
  EMPLOYEE_OFFBOARDED: 'Employee offboarded',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_CHANGED: 'Password changed',
  STORE_CREATED: 'Store created',
  STORE_UPDATED: 'Store updated',
  STORE_SETTINGS_UPDATED: 'Store settings changed',
  STAFF_LOGIN: 'Staff sign-in',
  ADMIN_LOGIN: 'Admin sign-in',
};

/** Who did what, when: credential approvals, offboarding, password resets and settings changes. */
export default function AuditPage() {
  const [storeId, setStoreId] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(100);
  const actionQuery = useDebounced(action.trim().toUpperCase(), 300);
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['admin-audit', storeId, actionQuery, limit],
    queryFn: () =>
      adminApi.get<AuditLogEntry[]>('/admin/audit', { query: { storeId: storeId || undefined, action: actionQuery || undefined, limit } }),
    placeholderData: keepPreviousData,
  });
  const { data: stores = [] } = useQuery({ queryKey: ['admin-stores'], queryFn: () => adminApi.get<AdminStoreRow[]>('/admin/stores') });
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Security-relevant actions across SmartCart, kept for compliance" />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-3">
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-56" aria-label="Store">
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Action, e.g. CREDENTIALS_ISSUED"
            className="w-72 font-mono"
            list="audit-actions"
          />
          <datalist id="audit-actions">
            {Object.keys(ACTION_LABELS).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        {isLoading ? (
          <PageLoader />
        ) : entries.length === 0 ? (
          <EmptyState icon="📜" title="No entries" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>What</Th>
                <Th>Store</Th>
                <Th>Details</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(e.createdAt)}</Td>
                  <Td>
                    <p className="text-slate-900">{e.actorName ?? 'System'}</p>
                    <Badge tone={e.actorKind === 'ADMIN' ? 'violet' : e.actorKind === 'STAFF' ? 'blue' : 'gray'}>
                      {e.actorKind.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td>
                    <p className="font-medium text-slate-900">{ACTION_LABELS[e.action] ?? e.action.replaceAll('_', ' ').toLowerCase()}</p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {e.entityType}
                      {e.entityId ? `:${e.entityId.slice(0, 8)}` : ''}
                    </p>
                  </Td>
                  <Td className="text-sm">{e.storeName ?? '—'}</Td>
                  <Td className="max-w-80">
                    <code className="block truncate text-[11px] text-slate-500" title={JSON.stringify(e.metadata)}>
                      {Object.keys(e.metadata).length > 0 ? JSON.stringify(e.metadata) : ''}
                    </code>
                  </Td>
                  <Td className="font-mono text-xs text-slate-400">{e.ip ?? ''}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {entries.length >= limit && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit(Math.min(200, limit + 100))} disabled={limit >= 200}>
              Show more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
