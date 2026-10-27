import { expect, test } from '@playwright/test';
import { INDIRANAGAR, loginCustomer, productBarcode, selectOptionContaining, storeByCode } from './helpers';

/**
 * The in-store journey: start Scan & Go with the family list, scan an item,
 * let a paired smart cart add another, pay with UPI on the phone, and walk
 * out through the exit gate, which opens exactly once.
 */
test('scan & go: scan, smart cart, pay, exit gate opens once', async ({ page, context, request }) => {
  const store = await storeByCode(request, INDIRANAGAR);
  const milk = await productBarcode(request, store.id, 'toned milk');

  await loginCustomer(page, 'priya@example.com');
  await page.goto('/instore');
  // A previous run may have left a session open: end it so we start clean.
  const resume = page.getByRole('button', { name: 'Continue shopping' });
  await expect(resume.or(page.getByRole('button', { name: "I'm in the store" }))).toBeVisible();
  if (await resume.isVisible()) {
    await resume.click();
    const backToCart = page.getByRole('button', { name: 'Back to my cart' });
    await expect(backToCart.or(page.getByRole('button', { name: 'Leave' }))).toBeVisible();
    if (await backToCart.isVisible()) await backToCart.click();
    await page.getByRole('button', { name: 'Leave' }).click();
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page).toHaveURL(/\/instore$/);
  }
  await page.getByLabel('Store', { exact: true }).selectOption({ label: store.name });
  await selectOptionContaining(page.getByLabel('Shopping list'), 'Weekly Groceries');
  await page.getByRole('button', { name: "I'm in the store" }).click();
  await expect(page).toHaveURL(/\/instore\/session/);
  await expect(page.getByText('Your route')).toBeVisible();

  // Scan a barcode (the camera is unavailable headless, so type it like a shopper would).
  await page.getByRole('button', { name: 'Scan item' }).first().click();
  await page.getByPlaceholder('Or type the barcode number').fill(milk.barcode);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(milk.name).first()).toBeVisible();

  // Pair a smart cart and drop a product into it: the phone updates live.
  await page.getByRole('button', { name: 'Pair smart cart' }).click();
  const pairingCode = (await page
    .locator('p.font-mono')
    .filter({ hasText: /^\d{6}$/ })
    .first()
    .textContent())!.trim();
  await page.keyboard.press('Escape');
  const cart = await context.newPage();
  await cart.goto(`/devices/cart?key=scdev_${INDIRANAGAR.toLowerCase()}_cart01&code=${pairingCode}`);
  await cart.getByRole('button', { name: 'Pair cart' }).click();
  await expect(cart.getByText('Cart contents')).toBeVisible();
  await cart.getByRole('button', { name: 'Drop in' }).first().click();
  await expect(cart.getByText(/^Added /)).toBeVisible();
  await expect(page.getByText(/Smart cart added/)).toBeVisible();

  // Pay with UPI (demo provider) and get the exit pass.
  await page.getByRole('button', { name: /^Checkout · / }).click();
  await page.getByRole('button', { name: /^UPI/ }).first().click();
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.getByRole('button', { name: 'Send payment request' }).click();
  await expect(page).toHaveURL(/\/exit\//, { timeout: 20_000 });
  await expect(page.getByText('Scan at the exit gate')).toBeVisible();
  const token = (await page.locator('p.font-mono').filter({ hasText: /^SC/ }).first().textContent())!.replace(/\s/g, '');
  expect(token).toMatch(/^SC[0-9A-Z]{18}$/);

  // The exit gate verifies the receipt and opens; the phone shows it live.
  const gate = await context.newPage();
  await gate.goto(`/devices/gate?key=scdev_${INDIRANAGAR.toLowerCase()}_gate1`);
  await gate.getByPlaceholder(/paste the code/).fill(token);
  await gate.getByRole('button', { name: 'Check' }).click();
  await expect(gate.getByText('Thank you, Priya!')).toBeVisible();
  await expect(page.getByText('Gate opened')).toBeVisible();

  // The same pass cannot open the gate twice.
  await gate.getByPlaceholder(/paste the code/).fill(token);
  await gate.getByRole('button', { name: 'Check' }).click();
  await expect(gate.getByText('This receipt has already been used to exit').first()).toBeVisible();
});
