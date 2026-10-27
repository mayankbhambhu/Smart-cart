import { STAFF_ROLE_LABELS, SocketEvents, timeAgo, type AppNotification, type StaffRole } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MonitorSmartphone,
  QrCode,
  Settings,
  ShoppingBag,
  Siren,
  Tag,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Logo } from '@/components/brand';
import { Avatar, Badge, EmptyState, IconButton, Select } from '@/components/ui';
import { logout, staffApi } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useSocketEvent } from '@/lib/socket';
import { useOpsStore } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useOps, useStoreRoom } from './hooks';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  minRole?: StaffRole;
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Today',
    items: [
      { to: '/ops', label: 'Overview', icon: <LayoutDashboard className="size-4" />, end: true },
      { to: '/ops/orders', label: 'Orders & pickups', icon: <ShoppingBag className="size-4" /> },
      { to: '/ops/live', label: 'Live floor & gates', icon: <MonitorSmartphone className="size-4" /> },
    ],
  },
  {
    section: 'Stock',
    items: [
      { to: '/ops/inventory', label: 'Inventory', icon: <Boxes className="size-4" /> },
      { to: '/ops/alerts', label: 'Restock alerts', icon: <Siren className="size-4" /> },
    ],
  },
  {
    section: 'People',
    items: [
      { to: '/ops/tasks', label: 'Tasks', icon: <ClipboardCheck className="size-4" /> },
      { to: '/ops/shifts', label: 'Shifts', icon: <CalendarClock className="size-4" /> },
      { to: '/ops/attendance', label: 'Attendance', icon: <Clock className="size-4" /> },
      { to: '/ops/team', label: 'Team & logins', icon: <Users className="size-4" /> },
    ],
  },
  {
    section: 'Business',
    items: [
      { to: '/ops/analytics', label: 'Analytics', icon: <BarChart3 className="size-4" />, minRole: 'STORE_MANAGER' },
      { to: '/ops/offers', label: 'Offers', icon: <Tag className="size-4" /> },
      { to: '/ops/support', label: 'SmartCart support', icon: <LifeBuoy className="size-4" />, minRole: 'FLOOR_MANAGER' },
      { to: '/ops/settings', label: 'Store settings', icon: <Settings className="size-4" />, minRole: 'STORE_MANAGER' },
    ],
  },
];

export default function OpsLayout() {
  const session = useSession('STAFF');
  if (!session || session.memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <EmptyState
          icon="🏬"
          title="No store assigned yet"
          body="Your account is not linked to an active store. Ask your store manager or SmartCart support."
          action={<LogoutButton />}
        />
      </div>
    );
  }
  return <Shell />;
}

function Shell() {
  const ops = useOps();
  const [menuOpen, setMenuOpen] = useState(false);
  useStoreRoom(ops.storeId);

  useSocketEvent<AppNotification>('STAFF', SocketEvents.NOTIFICATION, (n) => {
    toast.info(n.title, n.body);
  });

  return (
    <div className="min-h-screen bg-slate-50 lg:pl-64">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-950 text-slate-300 transition-transform lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/ops" onClick={() => setMenuOpen(false)}>
            <Logo dark subtitle="Store OS" />
          </Link>
          <IconButton label="Close menu" className="text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen(false)}>
            <X className="size-5" />
          </IconButton>
        </div>
        <StoreSwitcher />
        <nav className="mt-3 flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {NAV.map((group) => {
            const items = group.items.filter((item) => !item.minRole || ops.atLeast(item.minRole));
            if (items.length === 0) return null;
            return (
              <div key={group.section}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{group.section}</p>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                      )
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
          {ops.isLeadership && (
            <a
              href="/ops/kiosk"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-slate-100"
            >
              <QrCode className="size-4" /> Attendance kiosk
            </a>
          )}
        </nav>
        <UserCard />
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setMenuOpen(false)} />}

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
        <IconButton label="Open menu" className="lg:hidden" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{ops.membership.storeName}</p>
          <p className="text-xs text-slate-500">
            {STAFF_ROLE_LABELS[ops.role]} · {ops.membership.employeeCode}
          </p>
        </div>
        <NotificationsBell />
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function StoreSwitcher() {
  const ops = useOps();
  const setStore = useOpsStore((s) => s.setStore);
  const queryClient = useQueryClient();
  if (ops.memberships.length < 2) {
    return (
      <div className="mx-3 rounded-xl bg-white/5 px-3 py-2.5">
        <p className="truncate text-sm font-semibold text-white">{ops.membership.storeName}</p>
        <p className="text-xs text-slate-500">{ops.membership.storeCode}</p>
      </div>
    );
  }
  return (
    <div className="mx-3">
      <Select
        aria-label="Store"
        value={ops.storeId}
        onChange={(e) => {
          setStore(e.target.value);
          queryClient.clear();
        }}
        className="border-white/10 bg-white/5 text-white [&>option]:text-slate-900"
      >
        {ops.memberships.map((m) => (
          <option key={m.storeId} value={m.storeId}>
            {m.storeName}
          </option>
        ))}
      </Select>
    </div>
  );
}

function UserCard() {
  const session = useSession('STAFF')!;
  const ops = useOps();
  return (
    <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
      <Avatar name={session.user.name} size="sm" />
      <Link to="/ops/account" className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{session.user.name}</p>
        <p className="truncate text-xs text-slate-500">{STAFF_ROLE_LABELS[ops.role]}</p>
      </Link>
      <Link to="/ops/account" className="text-slate-500 hover:text-white" aria-label="My account">
        <UserCog className="size-4" />
      </Link>
      <LogoutButton compact />
    </div>
  );
}

function LogoutButton({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onClick = async () => {
    await logout('STAFF');
    queryClient.clear();
    navigate('/ops/login');
  };
  return compact ? (
    <button type="button" onClick={onClick} className="text-slate-500 hover:text-white" aria-label="Log out">
      <LogOut className="size-4" />
    </button>
  ) : (
    <button type="button" onClick={onClick} className="text-sm font-semibold text-brand-700">
      Log out
    </button>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['notifications', 'STAFF'],
    queryFn: () => staffApi.get<{ items: AppNotification[]; unread: number }>('/me/notifications', { query: { limit: 30 } }),
    refetchInterval: 60_000,
  });
  useSocketEvent('STAFF', SocketEvents.NOTIFICATION, () => void queryClient.invalidateQueries({ queryKey: ['notifications', 'STAFF'] }));
  const readAll = useMutation({
    mutationFn: () => staffApi.post('/me/notifications/read-all'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications', 'STAFF'] }),
  });
  const target = (n: AppNotification): string | null => {
    switch (n.type) {
      case 'TASK_ASSIGNED':
      case 'TASK_COMPLETED':
      case 'TASK_REVIEWED':
        return '/ops/tasks';
      case 'RESTOCK_ALERT':
        return '/ops/alerts';
      case 'SHIFT_ASSIGNED':
        return '/ops/shifts';
      case 'CREDENTIAL_REQUEST':
        return typeof n.data.requestId === 'string' ? `/ops/team/requests/${n.data.requestId}` : '/ops/team';
      case 'TICKET_UPDATE':
        return '/ops/support';
      case 'ORDER_STATUS':
        return '/ops/orders';
      default:
        return null;
    }
  };
  return (
    <div className="relative">
      <IconButton label="Notifications" onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="size-5" />
        {(data?.unread ?? 0) > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {data!.unread}
          </span>
        )}
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="font-bold text-slate-900">Notifications</p>
              {(data?.unread ?? 0) > 0 && (
                <button type="button" className="text-xs font-semibold text-brand-700" onClick={() => readAll.mutate()}>
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {(data?.items ?? []).length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</li>}
              {data?.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50', !n.readAt && 'bg-brand-50/40')}
                    onClick={() => {
                      void staffApi
                        .post(`/me/notifications/${n.id}/read`)
                        .then(() => queryClient.invalidateQueries({ queryKey: ['notifications', 'STAFF'] }));
                      const to = target(n);
                      setOpen(false);
                      if (to) navigate(to);
                    }}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{n.title}</span>
                      <span className="block text-xs text-slate-500">{n.body}</span>
                    </span>
                    <Badge tone="gray" className="shrink-0 self-start">
                      {timeAgo(n.createdAt)}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
