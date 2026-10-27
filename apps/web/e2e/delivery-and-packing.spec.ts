import { expect, test } from '@playwright/test';
import { loginCustomer, loginStaff } from './helpers';

/** 10-minute delivery: shop, pay with UPI, and the store packs and dispatches it while the customer watches. */
test('delivery order: checkout, store packs and dispatches, customer sees it live', async ({ browser }) => {
  const customer = await (await browser.newContext()).newPage();
  await loginCustomer(customer, 'priya@example.com');
  await customer.goto('/search?q=banana');
  await customer.getByRole('button', { name: 'ADD', exact: true }).first().click();
  await customer.goto('/search?q=bread');
  await customer.getByRole('button', { name: 'ADD', exact: true }).first().click();
  await customer
    .getByRole('button', { name: /My cart|items/ })
    .first()
    .click();
  await customer.getByRole('button', { name: /Proceed to checkout/ }).click();
  await expect(customer).toHaveURL(/\/checkout/);

  await customer.getByRole('button', { name: /^UPI/ }).first().click();
  await customer.getByRole('button', { name: /^Pay ₹/ }).click();
  await customer.getByRole('button', { name: 'Send payment request' }).click();
  await expect(customer).toHaveURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const orderNumber = (await customer.locator('h1').textContent())!.replace('Order', '').trim();

  // The store packs it and hands it to a rider.
  const staff = await (await browser.newContext()).newPage();
  await loginStaff(staff, 'kavya.reddy');
  await staff.goto('/ops/orders');
  const card = staff.locator('div.rounded-2xl', { hasText: orderNumber }).last();
  await card.getByRole('button', { name: 'Start packing' }).click();
  await expect(customer.getByText('Packing your order').first()).toBeVisible();
  await staff.locator('div.rounded-2xl', { hasText: orderNumber }).last().getByRole('button', { name: 'Hand to rider' }).click();
  await staff.getByPlaceholder('Imran Khan').fill('Imran Khan');
  await staff.getByRole('button', { name: 'Out for delivery' }).click();

  // The customer's tracking screen updates without a reload.
  await expect(customer.getByText('Arriving in')).toBeVisible();
  await expect(customer.getByText('Imran Khan', { exact: true })).toBeVisible();
});
