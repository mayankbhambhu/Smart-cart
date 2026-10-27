import { expect, test } from '@playwright/test';
import { loginCustomer } from './helpers';

/** "If a spouse adds milk at home, it syncs live to the shopper's app in the store." */
test('family list syncs live between two shoppers', async ({ browser }) => {
  const priya = await (await browser.newContext()).newPage();
  const rohit = await (await browser.newContext()).newPage();
  await loginCustomer(priya, 'priya@example.com');
  await loginCustomer(rohit, 'rohit@example.com');

  for (const page of [priya, rohit]) {
    await page.goto('/lists');
    await page.getByRole('link', { name: /Weekly Groceries/ }).click();
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
  }

  // Rohit adds a note item from home; it appears on Priya's phone without a reload.
  const item = `Coriander ${Date.now().toString().slice(-5)}`;
  await rohit.getByPlaceholder(/Add an item/).fill(item);
  await rohit.getByRole('button', { name: `Add "${item}" as a note item` }).click();
  await expect(rohit.getByText(item, { exact: true })).toBeVisible();
  await expect(priya.getByText(item, { exact: true })).toBeVisible();

  // Priya ticks it off in the store; Rohit sees who picked it.
  await priya
    .getByText(item, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"px-4")][1]')
    .getByRole('button', { name: 'Mark as bought' })
    .click();
  await expect(
    rohit
      .getByText(item, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"px-4")][1]')
      .getByText(/Picked by Priya/),
  ).toBeVisible();

  // Clean up.
  await rohit
    .getByText(item, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"px-4")][1]')
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(priya.getByText(item, { exact: true })).toHaveCount(0);
});
