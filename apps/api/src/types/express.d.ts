import type { AdminRole, Department, DeviceType, StaffRole, UserKind } from '@smartcart/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware for requests with a valid bearer token. */
      auth?: {
        userId: string;
        kind: UserKind;
        name: string;
        adminRole: AdminRole | null;
      };
      /** Set by `requireStaff` for routes under /ops/stores/:storeId. */
      staff?: {
        employeeId: string;
        storeId: string;
        role: StaffRole;
        department: Department;
        name: string;
        timezone: string;
      };
      /** Set by `requireDevice` for hardware endpoints (gates, smart carts, kiosks). */
      device?: {
        id: string;
        storeId: string;
        type: DeviceType;
        name: string;
      };
    }
  }
}

export {};
