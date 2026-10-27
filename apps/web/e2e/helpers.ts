import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const STAFF_PASSWORD = 'Staff@1234';
export const CUSTOMER_PASSWORD = 'Customer@123';
export const INDIRANAGAR = 'BLR-IND-01';

export async function loginCustomer(page: Page, email: string, password = CUSTOMER_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email' }).click();
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Signs in to Store OS; resolves on the dashboard, or on the forced password change for new employees. */
export async function loginStaff(page: Page, username: string, password = STAFF_PASSWORD): Promise<void> {
  await page.goto('/ops/login');
  await page.locator('input[autocomplete=username]').fill(username);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page.getByText('Choose your own password').or(page.getByRole('link', { name: 'Overview' }))).toBeVisible();
}

export async function loginAdmin(page: Page, email = 'admin@smartcart.dev', password = 'Admin@1234'): Promise<void> {
  await page.goto('/admin/login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await expect(page).toHaveURL(/\/admin$/);
}

export async function storeByCode(request: APIRequestContext, code: string): Promise<{ id: string; name: string }> {
  const stores = (await (await request.get('/api/v1/stores')).json()) as { id: string; code: string; name: string }[];
  const store = stores.find((s) => s.code === code);
  if (!store) throw new Error(`Store ${code} not found. Is the database seeded?`);
  return store;
}

export async function productBarcode(request: APIRequestContext, storeId: string, q: string): Promise<{ name: string; barcode: string }> {
  const res = await request.get('/api/v1/catalog/products', { params: { storeId, q, limit: 1, inStockOnly: 'true' } });
  const body = (await res.json()) as { items: { name: string; barcode: string }[] };
  if (!body.items[0]) throw new Error(`No product matches ${q}`);
  return body.items[0];
}

/** Selects the first <option> whose text contains `text`. */
export async function selectOptionContaining(select: Locator, text: string): Promise<void> {
  const options = await select.locator('option').allTextContents();
  const label = options.find((o) => o.includes(text));
  if (!label) throw new Error(`No option contains "${text}" (have: ${options.join(', ')})`);
  await select.selectOption({ label });
}
