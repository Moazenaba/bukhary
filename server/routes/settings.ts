import { Router } from 'express';
import { z } from 'zod';
import { can } from '../auth.ts';
import { audit } from '../audit.ts';
import type { Pool } from '../db.ts';
import { notFound, route } from '../http.ts';
import { id, optionalText } from '../schemas.ts';

// Shared settings that used to be stored per browser: competition books,
// permission profiles and custom permission labels.

const iso = (v: any) => (v instanceof Date ? v.toISOString() : v);

export function booksRouter(pool: Pool) {
  const r = Router();
  r.get('/', can('books.read'), route(async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM books ORDER BY name ASC;');
    res.json({ success: true, books: rows.map((b) => ({ id: b.id, name: b.name, createdAt: iso(b.created_at) })) });
  }));
  r.post('/', can('books.write'), route(async (req, res) => {
    const b = z.object({ id, name: z.string().trim().min(1, 'اسم الكتاب مطلوب').max(300) }).parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO books (id, name, created_by) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING *;`,
      [b.id, b.name, req.user!.id]
    );
    await audit(pool, req, 'book.save', 'book', b.id, null, b);
    res.json({ success: true, book: { id: rows[0].id, name: rows[0].name, createdAt: iso(rows[0].created_at) } });
  }));
  r.delete('/:id', can('books.write'), route(async (req, res) => {
    const { rows } = await pool.query('DELETE FROM books WHERE id = $1 RETURNING *;', [req.params.id]);
    if (!rows[0]) throw notFound('الكتاب غير موجود');
    await audit(pool, req, 'book.delete', 'book', req.params.id, { name: rows[0].name }, null);
    res.json({ success: true });
  }));
  return r;
}

const profileInput = z.object({
  id,
  name: z.string().trim().min(1, 'اسم البروفايل مطلوب').max(200),
  description: z.string().max(2000).default(''),
  badgeColor: z.enum(['emerald', 'blue', 'amber', 'purple', 'rose', 'teal']).nullish(),
  allowedTabs: z.array(z.string().max(50)).max(50).default([]),
  allowedCommittees: z.array(z.coerce.number().int().min(0)).max(1000).default([]),
  allCommitteesAllowed: z.boolean().default(false),
  allowedExamIds: z.array(z.string().max(255)).max(1000).default([]),
  allExamsAllowed: z.boolean().default(false),
  permissions: z.array(z.string().max(100)).max(200).default([]),
  isDefault: z.boolean().default(false),
});

function profileFromRow(p: any) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    badgeColor: p.badge_color ?? undefined,
    allowedTabs: p.allowed_tabs,
    allowedCommittees: p.allowed_committees,
    allCommitteesAllowed: p.all_committees_allowed,
    allowedExamIds: p.allowed_exam_ids,
    allExamsAllowed: p.all_exams_allowed,
    permissions: p.permissions,
    isDefault: p.is_default,
    createdBy: p.created_by ?? undefined,
    createdAt: iso(p.created_at),
  };
}

export function profilesRouter(pool: Pool) {
  const r = Router();
  r.get('/', can('profiles.read'), route(async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM permission_profiles ORDER BY created_at ASC;');
    res.json({ success: true, profiles: rows.map(profileFromRow) });
  }));
  r.post('/', can('profiles.write'), route(async (req, res) => {
    const p = profileInput.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO permission_profiles (id, name, description, badge_color, allowed_tabs, allowed_committees,
         all_committees_allowed, allowed_exam_ids, all_exams_allowed, permissions, is_default, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, description = EXCLUDED.description, badge_color = EXCLUDED.badge_color,
         allowed_tabs = EXCLUDED.allowed_tabs, allowed_committees = EXCLUDED.allowed_committees,
         all_committees_allowed = EXCLUDED.all_committees_allowed, allowed_exam_ids = EXCLUDED.allowed_exam_ids,
         all_exams_allowed = EXCLUDED.all_exams_allowed, permissions = EXCLUDED.permissions, is_default = EXCLUDED.is_default
       RETURNING *;`,
      [p.id, p.name, p.description, p.badgeColor ?? null, JSON.stringify(p.allowedTabs), JSON.stringify(p.allowedCommittees),
        p.allCommitteesAllowed, JSON.stringify(p.allowedExamIds), p.allExamsAllowed, JSON.stringify(p.permissions),
        p.isDefault, req.user!.name]
    );
    await audit(pool, req, 'profile.save', 'permission_profile', p.id, null, p);
    res.json({ success: true, profile: profileFromRow(rows[0]) });
  }));
  r.delete('/:id', can('profiles.write'), route(async (req, res) => {
    const { rows } = await pool.query('DELETE FROM permission_profiles WHERE id = $1 RETURNING id;', [req.params.id]);
    if (!rows[0]) throw notFound('البروفايل غير موجود');
    await audit(pool, req, 'profile.delete', 'permission_profile', req.params.id, null, null);
    res.json({ success: true });
  }));
  return r;
}

export function customPermissionsRouter(pool: Pool) {
  const r = Router();
  const fromRow = (p: any) => ({ id: p.id, label: p.label, description: p.description, icon: p.icon ?? undefined, isCustom: true });
  r.get('/', route(async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM custom_permissions ORDER BY created_at ASC;');
    res.json({ success: true, permissions: rows.map(fromRow) });
  }));
  r.post('/', can('profiles.write'), route(async (req, res) => {
    const p = z
      .object({ id, label: z.string().trim().min(1).max(200), description: z.string().max(2000).default(''), icon: optionalText(50) })
      .parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO custom_permissions (id, label, description, icon, created_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, icon = EXCLUDED.icon
       RETURNING *;`,
      [p.id, p.label, p.description, p.icon, req.user!.name]
    );
    await audit(pool, req, 'custom_permission.save', 'custom_permission', p.id, null, p);
    res.json({ success: true, permission: fromRow(rows[0]) });
  }));
  r.delete('/:id', can('profiles.write'), route(async (req, res) => {
    const { rows } = await pool.query('DELETE FROM custom_permissions WHERE id = $1 RETURNING id;', [req.params.id]);
    if (!rows[0]) throw notFound('الصلاحية غير موجودة');
    await audit(pool, req, 'custom_permission.delete', 'custom_permission', req.params.id, null, null);
    res.json({ success: true });
  }));
  return r;
}
