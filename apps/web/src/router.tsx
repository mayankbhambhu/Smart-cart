import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Link, useRouteError } from 'react-router';
import { Button, EmptyState, PageLoader } from '@/components/ui';
import { RequireAuth } from '@/lib/session';
import { CustomerLayout } from '@/portals/customer/CustomerLayout';

function page(loader: () => Promise<{ default: ComponentType }>): ReactNode {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function customerOnly(loader: () => Promise<{ default: ComponentType }>): ReactNode {
  return (
    <RequireAuth realm="CUSTOMER" loginPath="/login">
      {page(loader)}
    </RequireAuth>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <EmptyState
        icon="🧭"
        title="Page not found"
        body="The page you are looking for does not exist."
        action={
          <Link to="/">
            <Button>Go to the shop</Button>
          </Link>
        }
      />
    </div>
  );
}

function RouteError() {
  const error = useRouteError() as { status?: number; statusText?: string; message?: string };
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <EmptyState
        icon={error?.status === 404 ? '🧭' : '⚠️'}
        title={error?.status === 404 ? 'Page not found' : 'Something went wrong'}
        body={error?.status === 404 ? 'The page you are looking for does not exist.' : (error?.message ?? error?.statusText)}
        action={
          <Link to="/">
            <Button>Go to the shop</Button>
          </Link>
        }
      />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <CustomerLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(() => import('@/portals/customer/HomePage')) },
      { path: 'c/:categoryId', element: page(() => import('@/portals/customer/CategoryPage')) },
      { path: 'search', element: page(() => import('@/portals/customer/SearchPage')) },
      { path: 'stores', element: page(() => import('@/portals/customer/StoresPage')) },
      { path: 'instore', element: page(() => import('@/portals/customer/InStorePage')) },
      { path: 'instore/session', element: customerOnly(() => import('@/portals/customer/InStoreSessionPage')) },
      { path: 'exit/:orderId', element: customerOnly(() => import('@/portals/customer/ExitPassPage')) },
      { path: 'checkout', element: customerOnly(() => import('@/portals/customer/CheckoutPage')) },
      { path: 'orders', element: customerOnly(() => import('@/portals/customer/OrdersPage')) },
      { path: 'orders/:orderId', element: customerOnly(() => import('@/portals/customer/OrderDetailPage')) },
      { path: 'lists', element: customerOnly(() => import('@/portals/customer/ListsPage')) },
      { path: 'lists/:listId', element: customerOnly(() => import('@/portals/customer/ListDetailPage')) },
      { path: 'account', element: customerOnly(() => import('@/portals/customer/AccountPage')) },
      { path: 'payment/return', element: customerOnly(() => import('@/portals/customer/PaymentReturnPage')) },
      { path: 'login', element: page(() => import('@/portals/customer/LoginPage')) },
    ],
  },
  { path: '/ops/login', element: page(() => import('@/portals/ops/OpsLoginPage')), errorElement: <RouteError /> },
  {
    path: '/ops/kiosk',
    element: (
      <RequireAuth realm="STAFF" loginPath="/ops/login">
        {page(() => import('@/portals/ops/KioskPage'))}
      </RequireAuth>
    ),
  },
  {
    path: '/ops',
    errorElement: <RouteError />,
    element: (
      <RequireAuth realm="STAFF" loginPath="/ops/login">
        {page(() => import('@/portals/ops/OpsLayout'))}
      </RequireAuth>
    ),
    children: [
      { index: true, element: page(() => import('@/portals/ops/OverviewPage')) },
      { path: 'orders', element: page(() => import('@/portals/ops/OrdersBoardPage')) },
      { path: 'live', element: page(() => import('@/portals/ops/LiveStorePage')) },
      { path: 'inventory', element: page(() => import('@/portals/ops/InventoryPage')) },
      { path: 'alerts', element: page(() => import('@/portals/ops/AlertsPage')) },
      { path: 'tasks', element: page(() => import('@/portals/ops/TasksPage')) },
      { path: 'shifts', element: page(() => import('@/portals/ops/ShiftsPage')) },
      { path: 'attendance', element: page(() => import('@/portals/ops/AttendancePage')) },
      { path: 'team', element: page(() => import('@/portals/ops/TeamPage')) },
      { path: 'team/requests/new', element: page(() => import('@/portals/ops/RequestFormPage')) },
      { path: 'team/requests/:requestId', element: page(() => import('@/portals/ops/RequestDetailPage')) },
      { path: 'analytics', element: page(() => import('@/portals/ops/AnalyticsPage')) },
      { path: 'offers', element: page(() => import('@/portals/ops/OffersPage')) },
      { path: 'settings', element: page(() => import('@/portals/ops/SettingsPage')) },
      { path: 'support', element: page(() => import('@/portals/ops/SupportPage')) },
      { path: 'account', element: page(() => import('@/portals/ops/StaffAccountPage')) },
    ],
  },
  { path: '/admin/login', element: page(() => import('@/portals/admin/AdminLoginPage')), errorElement: <RouteError /> },
  {
    path: '/admin',
    errorElement: <RouteError />,
    element: (
      <RequireAuth realm="ADMIN" loginPath="/admin/login">
        {page(() => import('@/portals/admin/AdminLayout'))}
      </RequireAuth>
    ),
    children: [
      { index: true, element: page(() => import('@/portals/admin/AdminOverviewPage')) },
      { path: 'requests', element: page(() => import('@/portals/admin/RequestsPage')) },
      { path: 'requests/:requestId', element: page(() => import('@/portals/admin/AdminRequestPage')) },
      { path: 'stores', element: page(() => import('@/portals/admin/StoresPage')) },
      { path: 'stores/:storeId', element: page(() => import('@/portals/admin/StoreDetailPage')) },
      { path: 'employees', element: page(() => import('@/portals/admin/EmployeesPage')) },
      { path: 'tickets', element: page(() => import('@/portals/admin/TicketsPage')) },
      { path: 'audit', element: page(() => import('@/portals/admin/AuditPage')) },
    ],
  },
  { path: '/devices', element: page(() => import('@/portals/devices/DevicesHome')), errorElement: <RouteError /> },
  { path: '/devices/gate', element: page(() => import('@/portals/devices/GateSimulator')) },
  { path: '/devices/cart', element: page(() => import('@/portals/devices/SmartCartSimulator')) },
  { path: '*', element: <NotFound /> },
]);
