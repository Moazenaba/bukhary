import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupApp, userWithToken, type TestApp } from './helpers.ts';

let t: TestApp;
let admin: Awaited<ReturnType<typeof userWithToken>>;
let head: Awaited<ReturnType<typeof userWithToken>>;
beforeAll(async () => {
  t = await setupApp();
  admin = await userWithToken(t, { role: 'super_admin' });
  head = await userWithToken(t, { role: 'committee_head', permissions: ['manage_assistants'] });
});
afterAll(async () => {
  await t.pool.end();
});

async function apply(role: string, phone: string) {
  const res = await t.api().post('/api/auth/register').send({ name: `متقدم ${role}`, phone, password: 'Applicant123', roleKey: role });
  expect(res.status).toBe(201);
  const { rows } = await t.pool.query('SELECT id, name, phone FROM app_users WHERE phone = $1;', [phone]);
  return rows[0] as { id: string; name: string; phone: string };
}

const approve = (auth: Record<string, string>, u: { id: string; name: string; phone: string }) =>
  t.api().post('/api/users').set(auth).send({ id: u.id, name: u.name, phone: u.phone, status: 'approved' });

describe('approving join requests', () => {
  it('a committee head cannot activate an applicant who asked for a manager role', async () => {
    const applicant = await apply('committee_head', '0561000001');
    const res = await approve(head.auth, applicant);
    expect(res.status).toBe(403);
    const login = await t.api().post('/api/auth/login').send({ identifier: applicant.phone, password: 'Applicant123' });
    expect(login.status).toBe(403);
  });

  it('the super admin can activate it, and only then can the applicant log in', async () => {
    const applicant = await apply('teacher', '0561000002');
    expect((await approve(admin.auth, applicant)).status).toBe(200);
    const login = await t.api().post('/api/auth/login').send({ identifier: applicant.phone, password: 'Applicant123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('teacher');
  });

  it('a committee head can still approve an assistant applicant', async () => {
    const applicant = await apply('assistant', '0561000003');
    expect((await approve(head.auth, applicant)).status).toBe(200);
  });

  it('an unknown role in a join request falls back to assistant', async () => {
    const applicant = await apply('super_admin', '0561000004');
    const { rows } = await t.pool.query('SELECT role, status FROM app_users WHERE id = $1;', [applicant.id]);
    expect(rows[0]).toEqual({ role: 'assistant', status: 'pending' });
  });

  it('accepts a phone typed with Arabic-Indic digits, at registration and at login', async () => {
    const res = await t.api().post('/api/auth/register').send({ name: 'متقدم بأرقام عربية', phone: '٠٥٦١٠٠٠٠٠٥', password: 'Applicant123' });
    expect(res.status).toBe(201);
    const { rows } = await t.pool.query('SELECT id, name, phone FROM app_users WHERE phone = $1;', ['0561000005']);
    expect(rows).toHaveLength(1);
    expect((await approve(admin.auth, rows[0])).status).toBe(200);
    const login = await t.api().post('/api/auth/login').send({ identifier: '٠٥٦١٠٠٠٠٠٥', password: 'Applicant123' });
    expect(login.status).toBe(200);
  });
});
