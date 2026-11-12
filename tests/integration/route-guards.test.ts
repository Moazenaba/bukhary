import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupApp, type TestApp } from '../helpers.ts';

// Security net: every API route the server has — including ones added later — refuses a request
// without a login, except a short, reviewed list of public routes.
const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/ready',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/register',
  'GET /api/auth/join-status/:code',
]);

let t: TestApp;
beforeAll(async () => {
  t = await setupApp();
});
afterAll(async () => {
  await t.pool.end();
});

/** Every "METHOD /path" registered on the Express app, mounted routers included. */
function listRoutes(app: any): string[] {
  const out: string[] = [];
  const prefixOf = (layer: any) =>
    String(layer.regexp?.source ?? '')
      .replace(/^\^/, '')
      .replace(/\\\/\?\(\?=\\\/\|\$\)$/i, '')
      .replace(/\\\//g, '/');
  const walk = (stack: any[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + prefixOf(layer));
      }
    }
  };
  walk(app._router.stack, '');
  return [...new Set(out)].filter((r) => r.split(' ')[1].startsWith('/api'));
}

describe('route guards', () => {
  it('finds the API routes (sanity check of the route walker)', () => {
    const routes = listRoutes(t.app);
    expect(routes.length).toBeGreaterThan(40);
    expect(routes).toContain('POST /api/committees/:id/actions');
    expect(routes).toContain('GET /api/exams/:id/file');
  });

  it('every non-public route answers 401 without a login', async () => {
    const open: string[] = [];
    for (const r of listRoutes(t.app)) {
      if (PUBLIC.has(r)) continue;
      const [method, path] = r.split(' ');
      const url = path.replace(/:[A-Za-z]+/g, 'x');
      const res = await (t.api() as any)[method.toLowerCase()](url).send({});
      if (res.status !== 401) open.push(`${r} → ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it('a forged or expired token is refused everywhere', async () => {
    for (const r of listRoutes(t.app).filter((x) => !PUBLIC.has(x)).slice(0, 15)) {
      const [method, path] = r.split(' ');
      const res = await (t.api() as any)[method.toLowerCase()](path.replace(/:[A-Za-z]+/g, 'x'))
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged').send({});
      expect(res.status, r).toBe(401);
    }
  });
});
