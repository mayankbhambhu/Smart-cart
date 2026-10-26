import type { AuthSession, CatalogProduct, StoreSummary } from '@smartcart/shared';
import supertest from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();
export const api = () => supertest(app);

export const PASSWORDS = { admin: 'Admin@1234', staff: 'Staff@1234', customer: 'Customer@123' };

const sessions = new Map<string, AuthSession>();

export async function customerSession(email = 'priya@example.com', password = PASSWORDS.customer): Promise<AuthSession> {
  const key = `customer:${email}`;
  if (!sessions.has(key)) {
    const res = await api().post('/api/v1/auth/login').send({ email, password }).expect(200);
    sessions.set(key, res.body as AuthSession);
  }
  return sessions.get(key)!;
}

export async function staffSession(identifier: string, password = PASSWORDS.staff): Promise<AuthSession> {
  const key = `staff:${identifier}`;
  if (!sessions.has(key)) {
    const res = await api().post('/api/v1/auth/staff/login').send({ identifier, password }).expect(200);
    sessions.set(key, res.body as AuthSession);
  }
  return sessions.get(key)!;
}

export async function adminSession(email = 'admin@smartcart.dev'): Promise<AuthSession> {
  const key = `admin:${email}`;
  if (!sessions.has(key)) {
    const res = await api().post('/api/v1/auth/admin/login').send({ email, password: PASSWORDS.admin }).expect(200);
    sessions.set(key, res.body as AuthSession);
  }
  return sessions.get(key)!;
}

export function bearer(session: AuthSession): { Authorization: string } {
  return { Authorization: `Bearer ${session.accessToken}` };
}

export async function storeByCode(code: string): Promise<StoreSummary> {
  const res = await api().get('/api/v1/stores').expect(200);
  const store = (res.body as StoreSummary[]).find((s) => s.code === code);
  if (!store) throw new Error(`Store ${code} not found`);
  return store;
}

export async function findProduct(storeId: string, q: string): Promise<CatalogProduct> {
  const res = await api().get('/api/v1/catalog/products').query({ storeId, q, limit: 5 }).expect(200);
  const product = (res.body.items as CatalogProduct[])[0];
  if (!product) throw new Error(`No product matching "${q}"`);
  return product;
}

/** A brand-new customer (phone OTP sign-up) so tests do not collide on shared accounts. */
export async function newCustomer(name: string): Promise<AuthSession> {
  const phone = `+9191${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const otp = await api().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await api().post('/api/v1/auth/otp/verify').send({ phone, code: otp.body.devCode, name }).expect(200);
  return res.body as AuthSession;
}
