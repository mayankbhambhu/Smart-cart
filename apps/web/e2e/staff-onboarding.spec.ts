import { expect, test } from '@playwright/test';
import { loginAdmin, loginStaff } from './helpers';

/**
 * A new joiner's login: the store manager requests it, the owner approves,
 * the SmartCart admin issues credentials, and the employee signs in and is
 * forced to choose their own password.
 */
test('login request: manager → owner → admin → first sign-in', async ({ browser }) => {
  const suffix = Date.now().toString().slice(-6);
  const name = `Test Joiner ${String.fromCharCode(65 + (Number(suffix) % 26))}${suffix.slice(0, 2)}`;
  const email = `joiner.${suffix}@example.com`;
  const phone = `+9198${suffix}${suffix.slice(0, 2)}`;

  // 1. Store manager raises the request.
  const manager = await (await browser.newContext()).newPage();
  await loginStaff(manager, 'kavya.reddy');
  await expect(manager).toHaveURL(/\/ops$/);
  await manager.goto('/ops/team/requests/new');
  await manager.getByLabel('Full name').fill(name);
  await manager.getByLabel('Email').fill(email);
  await manager.getByLabel('Mobile number').fill(phone);
  await manager.getByLabel('Wage (₹)').fill('18000');
  await manager.getByRole('button', { name: 'Send to the owner' }).click();
  await expect(manager.getByText('Waiting for store owner').first()).toBeVisible();
  const requestUrl = manager.url();

  // 2. The owner approves it.
  const owner = await (await browser.newContext()).newPage();
  await loginStaff(owner, 'arjun.mehta');
  await expect(owner).toHaveURL(/\/ops$/);
  await owner.goto(new URL(requestUrl).pathname);
  await owner.getByRole('button', { name: 'Approve' }).click();
  await owner.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(owner.getByText('Waiting for SmartCart admin').first()).toBeVisible();

  // 3. SmartCart admin issues the login.
  const admin = await (await browser.newContext()).newPage();
  await loginAdmin(admin);
  await admin.goto('/admin/requests');
  await admin.getByRole('link', { name }).click();
  await admin.getByRole('button', { name: 'Approve & issue login' }).click();
  await admin.getByRole('button', { name: 'Approve and issue' }).click();
  const credentials = admin.getByRole('dialog');
  await expect(credentials.getByText('Login issued')).toBeVisible();
  const username = (await credentials.locator('dd').nth(0).textContent())!.trim();
  const temporaryPassword = (await credentials.locator('dd').nth(2).textContent())!.trim();

  // The manager sees the approval live.
  await expect(manager.getByText('Login issued').first()).toBeVisible();

  // 4. The employee signs in and must change the temporary password.
  const employee = await (await browser.newContext()).newPage();
  await loginStaff(employee, username, temporaryPassword);
  await expect(employee.getByText('Choose your own password')).toBeVisible();
  await employee.locator('input[autocomplete=new-password]').nth(0).fill('Joiner@2026');
  await employee.locator('input[autocomplete=new-password]').nth(1).fill('Joiner@2026');
  await employee.getByRole('button', { name: 'Save and continue' }).click();
  await expect(employee).toHaveURL(/\/ops$/);
  await expect(employee.getByText(`Good`)).toBeVisible();
});
