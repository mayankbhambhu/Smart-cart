import { ADMIN_ROLE_LABELS, SocketEvents, type AdminOverview, type AppNotification } from '@smartcart/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, FileClock, Inbox, LayoutDashboard, LifeBuoy, LogOut, Menu, Users, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Logo } from '@/components/brand';
import { Avatar, IconButton } from '@/components/ui';
import { adminApi, logout } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useSocketEvents } from '@/lib/socket';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const NAV: { to: string; label: string; icon: ReactNode; end?: boolean; badge?: 'requests' | 'tickets' }[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard className="size-4" />, end: true },
  { to: '/admin/requests', label: 'Login requests', icon: <Inbox className="size-4" />, badge: 'requests' },
  { to: '/admin/stores', label: 'Stores & owners', icon: <Building2 className="size-4" /> },
  { to: '/admin/employees', label: 'Employees', icon: <Users className="size-4" /> },
  { to: '/admin/tickets', label: 'Store requests', icon: <LifeBuoy className="size-4" />, badge: 'tickets' },
  { to: '/admin/audit', label: 'Audit log', icon: <FileClock className="size-4" /> },
];

/** Shell for the SmartCart team's console. */
export default function AdminLayout() {
  const session = useSession('ADMIN')!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: overview } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => adminApi.get<AdminOverview>('/admin/overview'),
    refetchInterval: 60_000,
  });

  useSocketEvents('ADMIN', [SocketEvents.REQUEST_CHANGED, SocketEvents.TICKET_CHANGED, SocketEvents.NOTIFICATION], (event, payload) => {
    void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    if (event === SocketEvents.REQUEST_CHANGED) void queryClient.invalidateQueries({ queryKey: ['admin-requests'] });
    if (event === SocketEvents.TICKET_CHANGED) void queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
    if (event === SocketEvents.NOTIFICATION) {
      const n = payload as AppNotification;
      toast.info(n.title, n.body);
    }
  });

  const counts = { requests: overview?.pendingRequests ?? 0, tickets: overview?.openTickets ?? 0 };
  return (
    <div className="min-h-screen bg-slate-50 lg:pl-64">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-gradient-to-b from-slate-950 to-indigo-950 text-slate-300 transition-transform lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo dark subtitle="Admin console" />
          <IconButton label="Close menu" className="text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen(false)}>
            <X className="size-5" />
          </IconButton>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                )
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge && counts[item.badge] > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900">{counts[item.badge]}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <Avatar name={session.user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{session.user.name}</p>
            <p className="truncate text-xs text-slate-500">
              {session.user.adminRole ? ADMIN_ROLE_LABELS[session.user.adminRole] : 'Admin'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Log out"
            className="text-slate-500 hover:text-white"
            onClick={async () => {
              await logout('ADMIN');
              queryClient.clear();
              navigate('/admin/login');
            }}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={() => setMenuOpen(false)} />}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <IconButton label="Open menu" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
        <p className="font-bold text-slate-900">SmartCart admin</p>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
