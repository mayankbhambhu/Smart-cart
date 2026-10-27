import type { Department, Priority, StaffRole, TaskCategory, TaskStatus, WageType } from '@smartcart/shared';
import { eq } from 'drizzle-orm';
import { addDays, minutesBetween, zonedParts, zonedToUtc } from '../../lib/time';
import { db } from '../client';
import { attendanceRecords, employees, shiftTemplates, shifts, tasks, users } from '../schema';
import { chunk, type Random } from './random';

export interface StaffSpec {
  name: string;
  username: string;
  role: StaffRole;
  department: Department;
  designation: string;
  wageType: WageType;
  wage: number;
  joinedDaysAgo: number;
  phone: string;
}

export interface SeededEmployee {
  id: string;
  userId: string;
  name: string;
  username: string;
  role: StaffRole;
  department: Department;
  storeId: string;
}

export async function seedStoreStaff(
  store: { id: string; code: string },
  specs: StaffSpec[],
  passwordHash: string,
  now: Date,
  existingUsers: Map<string, string>,
): Promise<SeededEmployee[]> {
  const seeded: SeededEmployee[] = [];
  let sequence = 0;
  const today = now.toISOString().slice(0, 10);
  for (const spec of specs) {
    let userId = existingUsers.get(spec.username);
    if (!userId) {
      const [user] = await db
        .insert(users)
        .values({
          kind: 'STAFF',
          name: spec.name,
          email: `${spec.username}@staff.smartcart.dev`,
          phone: spec.phone,
          username: spec.username,
          passwordHash,
          lastLoginAt: new Date(now.getTime() - 3 * 3600_000),
        })
        .returning({ id: users.id });
      userId = user!.id;
      existingUsers.set(spec.username, userId);
    }
    sequence++;
    const [employee] = await db
      .insert(employees)
      .values({
        userId,
        storeId: store.id,
        employeeCode: `${store.code}-${String(sequence).padStart(3, '0')}`,
        fullName: spec.name,
        email: `${spec.username}@staff.smartcart.dev`,
        phone: spec.phone,
        role: spec.role,
        department: spec.department,
        designation: spec.designation,
        joiningDate: addDays(today, -spec.joinedDaysAgo),
        wageType: spec.wageType,
        wageAmount: spec.wage * 100,
        address: 'Bengaluru',
        emergencyContactName: 'Family contact',
        emergencyContactPhone: '+919800000000',
        idProofType: 'AADHAAR',
        idProofLast4: String(1000 + sequence * 37).slice(-4),
      })
      .returning({ id: employees.id });
    seeded.push({
      id: employee!.id,
      userId,
      name: spec.name,
      username: spec.username,
      role: spec.role,
      department: spec.department,
      storeId: store.id,
    });
  }
  // Reporting lines: workers -> floor managers, floor managers -> store manager, manager -> owner.
  const owner = seeded.find((e) => e.role === 'OWNER');
  const manager = seeded.find((e) => e.role === 'STORE_MANAGER');
  const floorManagers = seeded.filter((e) => e.role === 'FLOOR_MANAGER');
  let i = 0;
  for (const employee of seeded) {
    let reportsTo: string | undefined;
    if (employee.role === 'STORE_MANAGER') reportsTo = owner?.id;
    if (employee.role === 'FLOOR_MANAGER') reportsTo = manager?.id;
    if (employee.role === 'WORKER') reportsTo = floorManagers[i++ % Math.max(1, floorManagers.length)]?.id;
    if (reportsTo) {
      await db.update(employees).set({ reportsToId: reportsTo }).where(eq(employees.id, employee.id));
    }
  }
  return seeded;
}

const TEMPLATES = [
  { name: 'Morning', startTime: '07:00', endTime: '15:00', breakMinutes: 30, color: '#f59e0b' },
  { name: 'Evening', startTime: '15:00', endTime: '23:00', breakMinutes: 30, color: '#6366f1' },
  { name: 'General', startTime: '10:00', endTime: '19:00', breakMinutes: 60, color: '#0f8a4b' },
];

/** Shift roster for the past 30 days and the coming week, with matching attendance. */
export async function seedShiftsAndAttendance(
  rng: Random,
  store: { id: string; timezone: string },
  staff: SeededEmployee[],
  now: Date,
): Promise<{ shifts: number; attendance: number }> {
  await db.insert(shiftTemplates).values(TEMPLATES.map((t) => ({ ...t, storeId: store.id })));
  const today = zonedParts(now, store.timezone).date;
  const manager = staff.find((e) => e.role === 'STORE_MANAGER');
  const shiftRows: (typeof shifts.$inferInsert)[] = [];
  const attendanceRows: (typeof attendanceRecords.$inferInsert)[] = [];

  staff
    .filter((e) => e.role !== 'OWNER')
    .forEach((employee, index) => {
      const weeklyOff = (index * 3) % 7;
      for (let offset = -30; offset <= 7; offset++) {
        const date = addDays(today, offset);
        const dow = zonedParts(zonedToUtc(date, '12:00', store.timezone), store.timezone).dow;
        if (dow === weeklyOff) continue;
        const week = Math.floor((offset + 35) / 7);
        const template = employee.role === 'STORE_MANAGER' ? TEMPLATES[2]! : (week + index) % 2 === 0 ? TEMPLATES[0]! : TEMPLATES[1]!;
        const startAt = zonedToUtc(date, template.startTime, store.timezone);
        const endAt = zonedToUtc(date, template.endTime, store.timezone);
        const shiftId = crypto.randomUUID();
        shiftRows.push({
          id: shiftId,
          storeId: store.id,
          employeeId: employee.id,
          date,
          startAt,
          endAt,
          label: template.name,
          breakMinutes: template.breakMinutes,
          createdById: manager?.id ?? null,
        });

        if (startAt > now) continue;
        const absent = rng.chance(offset === 0 ? 0.12 : 0.04);
        if (absent) continue;
        const late = rng.chance(0.13);
        const clockInAt = new Date(startAt.getTime() + (late ? rng.int(11, 42) : rng.int(-14, 7)) * 60_000);
        if (clockInAt > now) continue;
        const plannedOut = new Date(endAt.getTime() + rng.int(-12, 28) * 60_000);
        const stillWorking = plannedOut > now;
        const clockOutAt = stillWorking ? null : plannedOut;
        const lateBy = Math.max(0, minutesBetween(startAt, clockInAt));
        attendanceRows.push({
          storeId: store.id,
          employeeId: employee.id,
          shiftId,
          clockInAt,
          clockOutAt,
          clockInMethod: rng.chance(0.3) ? 'KIOSK' : 'APP',
          clockOutMethod: clockOutAt ? 'APP' : null,
          workedMinutes: clockOutAt ? Math.max(0, minutesBetween(clockInAt, clockOutAt) - template.breakMinutes) : 0,
          lateByMinutes: lateBy > 10 ? lateBy : 0,
          leftEarlyByMinutes: clockOutAt ? Math.max(0, minutesBetween(clockOutAt, endAt)) : 0,
          createdAt: clockInAt,
        });
      }
    });

  for (const rows of chunk(shiftRows, 1500)) await db.insert(shifts).values(rows);
  for (const rows of chunk(attendanceRows, 1500)) await db.insert(attendanceRecords).values(rows);
  return { shifts: shiftRows.length, attendance: attendanceRows.length };
}

const TASK_LIBRARY: { title: string; category: TaskCategory; description: string; aisle?: number }[] = [
  {
    title: 'Rotate dairy stock (FIFO)',
    category: 'RESTOCK',
    description: 'Move older milk and curd batches to the front of the chiller.',
    aisle: 2,
  },
  {
    title: 'Clean spill near snacks aisle',
    category: 'CLEANING',
    description: 'Customer reported a cola spill at the end of aisle 4.',
    aisle: 4,
  },
  {
    title: 'Cycle count: beverages',
    category: 'INVENTORY_COUNT',
    description: 'Count all SKUs in aisle 5 and update the system counts.',
    aisle: 5,
  },
  {
    title: 'Set up festive sweets display',
    category: 'DISPLAY_SETUP',
    description: 'Build the end-cap display with Kaju Katli and Rasgulla tins.',
    aisle: 4,
  },
  {
    title: 'Check expiry dates in bakery',
    category: 'INVENTORY_COUNT',
    description: 'Pull items expiring within 2 days and mark them for markdown.',
    aisle: 3,
  },
  {
    title: 'Restock fresh produce bins',
    category: 'RESTOCK',
    description: 'Top up tomatoes, onions and bananas before the evening rush.',
    aisle: 1,
  },
  {
    title: 'Fix price tags in staples aisle',
    category: 'DISPLAY_SETUP',
    description: 'Shelf labels for atta and rice still show last week’s prices.',
    aisle: 6,
  },
  { title: 'Sanitise smart carts', category: 'CLEANING', description: 'Wipe handles and scanners of all smart carts at the entrance.' },
  { title: 'Help desk cover 6-8 pm', category: 'CUSTOMER_SERVICE', description: 'Cover the help desk during the evening rush.' },
  {
    title: 'Replace flickering light in aisle 8',
    category: 'MAINTENANCE',
    description: 'Freezer aisle light is flickering; call facilities if needed.',
    aisle: 8,
  },
  { title: 'Pick morning pickup orders', category: 'ORDER_PICKING', description: 'Pack all pickup orders scheduled before 11 am.' },
  { title: 'Unload supplier delivery', category: 'RESTOCK', description: 'Hindustan Unilever delivery arriving at the back gate at 9 am.' },
  { title: 'Deep clean freezer aisle', category: 'CLEANING', description: 'Defrost and clean the ice cream freezer.', aisle: 8 },
  { title: 'Audit exit gate logs', category: 'OTHER', description: 'Review denied scans from yesterday and note any patterns.' },
  {
    title: 'Restock personal care shelves',
    category: 'RESTOCK',
    description: 'Shampoo and soap facings are thin after the weekend.',
    aisle: 9,
  },
];

const COMPLETION_NOTES = [
  'Done. Moved 24 units and faced the shelf.',
  'Completed, also wiped the shelf edges.',
  'Finished. Two items were damaged, logged them as damage.',
  'All done, counts matched the system except two SKUs (adjusted).',
  'Completed before the evening rush.',
];

const REVIEW_COMMENTS = [
  'Great job, thanks!',
  'Neat work.',
  'Good, but please tell me when you start next time.',
  'Perfect.',
  'Well done.',
];

export async function seedTasks(rng: Random, storeId: string, staff: SeededEmployee[], now: Date): Promise<number> {
  const manager = staff.find((e) => e.role === 'STORE_MANAGER')!;
  const floorManagers = staff.filter((e) => e.role === 'FLOOR_MANAGER');
  const assignees = staff.filter((e) => e.role === 'WORKER' || e.role === 'FLOOR_MANAGER');
  const plan: [TaskStatus, number][] = [
    ['APPROVED', 12],
    ['DONE', 4],
    ['IN_PROGRESS', 4],
    ['TODO', 7],
    ['REOPENED', 2],
    ['CANCELLED', 1],
  ];
  const rows: (typeof tasks.$inferInsert)[] = [];
  for (const [status, count] of plan) {
    for (let i = 0; i < count; i++) {
      const template = rng.pick(TASK_LIBRARY);
      const assignee = rng.pick(assignees);
      const assigner = assignee.role === 'WORKER' && floorManagers.length > 0 && rng.chance(0.4) ? rng.pick(floorManagers) : manager;
      const ageHours = status === 'TODO' || status === 'IN_PROGRESS' ? rng.int(1, 30) : rng.int(20, 14 * 24);
      const createdAt = new Date(now.getTime() - ageHours * 3600_000);
      const dueAt = new Date(createdAt.getTime() + rng.int(2, 26) * 3600_000);
      const startedAt = status === 'TODO' ? null : new Date(createdAt.getTime() + rng.int(10, 90) * 60_000);
      const done = status === 'DONE' || status === 'APPROVED' || status === 'REOPENED';
      const completedAt = done ? new Date(startedAt!.getTime() + rng.int(20, 180) * 60_000) : null;
      const reviewed = status === 'APPROVED' || status === 'REOPENED';
      const priority: Priority = rng.weighted(
        [
          ['LOW', 2],
          ['MEDIUM', 5],
          ['HIGH', 3],
          ['URGENT', 1],
        ] as const,
        (p) => p[1],
      )[0];
      rows.push({
        storeId,
        title: template.title,
        description: template.description,
        category: template.category,
        priority,
        status,
        assigneeId: assignee.id,
        assignedById: assigner.id,
        aisle: template.aisle ?? null,
        dueAt,
        startedAt,
        completedAt,
        completionNote: done ? rng.pick(COMPLETION_NOTES) : null,
        reviewRating: status === 'APPROVED' ? rng.weighted([3, 4, 4, 5, 5, 5], () => 1) : null,
        reviewComment:
          status === 'APPROVED' ? rng.pick(REVIEW_COMMENTS) : status === 'REOPENED' ? 'Two facings are still empty, please finish.' : null,
        reviewedById: reviewed ? assigner.id : null,
        reviewedAt: reviewed ? new Date(completedAt!.getTime() + rng.int(15, 240) * 60_000) : null,
        createdAt,
        updatedAt: completedAt ?? startedAt ?? createdAt,
      });
    }
  }
  await db.insert(tasks).values(rows);
  return rows.length;
}
