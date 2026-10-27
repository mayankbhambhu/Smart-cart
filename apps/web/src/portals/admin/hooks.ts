import { useSession } from '@/lib/auth';

/** Support agents can read everything; only admins and super admins approve logins, onboard stores or offboard staff. */
export function useAdminRole() {
  const role = useSession('ADMIN')?.user.adminRole ?? 'SUPPORT';
  return { role, canManage: role === 'SUPER_ADMIN' || role === 'ADMIN' };
}
