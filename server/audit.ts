import crypto from 'crypto';
import type { Request } from 'express';
import type { Queryable } from './db.ts';

/**
 * Records a mutation in audit_logs. Call it with the same client as the mutation
 * (inside the transaction) so the log and the change commit or roll back together.
 */
export async function audit(
  db: Queryable,
  req: Request,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
  details = ''
): Promise<void> {
  const user = req.user;
  // While an admin acts as someone, the row names both: the person (whose account acted) and the admin.
  const by = user?.impersonator;
  await db.query(
    `INSERT INTO audit_logs (id, user_name, user_role, action, details, status, ip_address, actor_id, entity, entity_id, before_data, after_data,
                             impersonator_id, impersonator_name, created_at)
     VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8, $9, $10, $11, $12, $13, NOW());`,
    [
      crypto.randomUUID(),
      user?.name ?? 'system',
      user?.role ?? 'system',
      action,
      by ? `${details ? `${details} — ` : ''}بواسطة ${by.name} نيابة عن ${user!.name}` : details,
      req.ip ?? null,
      user?.id ?? null,
      entity,
      entityId,
      before === undefined || before === null ? null : JSON.stringify(before),
      after === undefined || after === null ? null : JSON.stringify(after),
      by?.id ?? null,
      by?.name ?? null,
    ]
  );
}
