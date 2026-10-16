import { z } from 'zod';

// Shared building blocks for request validation. Unknown keys are stripped, so only
// the fields listed here can ever reach the database (no mass assignment).

export const id = z.string().trim().min(1).max(255);
export const shortText = z.string().max(500);
export const longText = z.string().max(10_000);

/** '' and null both mean "not set". */
export const optionalText = (max = 500) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v));

export const optionalId = z
  .string()
  .max(255)
  .nullish()
  .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()));

export const nonNegativeInt = z.coerce.number().int().min(0).max(1_000_000);

export const STAGE_KEYS = [
  'registration',
  'exam',
  'scoring',
  'aggregation',
  'review',
  'sheet',
  'accreditation',
  'announcement',
  'ceremony',
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export const stageRecord = z.object({
  completed: z.boolean(),
  completedAt: z.string().max(100).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const stagesPartial = z.object(
  Object.fromEntries(STAGE_KEYS.map((k) => [k, stageRecord.optional()])) as Record<StageKey, z.ZodOptional<typeof stageRecord>>
);

export const questionItem = z.object({
  id: z.string().max(100),
  questionNumber: z.coerce.number().int().min(0).max(1000),
  label: z.string().max(300),
  completed: z.boolean(),
  completedAt: z.string().max(100).nullish(),
  scorers: z.array(z.string().max(200)).max(20).optional(),
  score: z.number().nullish(),
  notes: z.string().max(2000).nullish(),
});

export const scoringDetails = z.object({
  scorerName: z.string().max(200).nullish(),
  scoringReviewerName: z.string().max(200).nullish(),
  questions: z.array(questionItem).max(100).default([]),
  notes: z.string().max(5000).nullish(),
});

export const aggregationDetails = z.object({
  aggregatorName: z.string().max(200).nullish(),
  scoringReviewerName: z.string().max(200).nullish(),
  aggregationReviewerName: z.string().max(200).nullish(),
  reviewConfirmed: z.boolean().nullish(),
  date: z.string().max(100).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const ceremonyDetails = z.object({
  honoredStudentsCount: z.coerce.number().int().min(0).max(100_000).nullish(),
  attendingSheikhs: z.array(z.string().max(200)).max(50).default([]),
  ceremonyDate: z.string().max(100).nullish(),
  ceremonyTime: z.string().max(100).nullish(),
  ceremonyPlace: z.string().max(300).nullish(),
  notes: z.string().max(5000).nullish(),
});

// Who received / approved is always taken from the logged-in user, never from the body;
// clients may only send notes (and the delivery status for receptions).
export const receptionInput = z.object({
  status: z.enum(['received', 'in_delivery']).default('received'),
  phone: z.string().max(50).nullish(),
  notes: z.string().max(2000).nullish(),
});
export const approvalInput = z.object({
  notes: z.string().max(2000).nullish(),
});

/** Optional optimistic-concurrency token: the `updatedAt` the client last saw. */
export const expectedUpdatedAt = z.string().datetime({ offset: true }).optional();

/** A calendar date (YYYY-MM-DD, or YYYY/MM/DD which is normalised). '' and null mean "not set". */
export const dateOnly = z
  .string()
  .max(20)
  .nullish()
  .transform((v, ctx) => {
    const t = v?.trim() ?? '';
    if (t === '') return null;
    const m = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(t);
    const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : '';
    if (!m || new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD' });
      return z.NEVER;
    }
    return iso;
  });

/** A point in time sent as an ISO string or a date; stored as timestamptz. */
export const timestampInput = z
  .string()
  .max(40)
  .nullish()
  .transform((v, ctx) => {
    const t = v?.trim() ?? '';
    if (t === '') return null;
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'التاريخ والوقت غير صالحين' });
      return z.NEVER;
    }
    return new Date(ms).toISOString();
  });

/**
 * Optional paging for list endpoints. Without `limit` the full list is returned, as before;
 * with it the response carries `total` and `hasMore` so clients can page through.
 */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

/** Runs a list query with optional paging. `sql` must not end with a semicolon. */
export async function pagedRows<T>(
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> },
  sql: string,
  countSql: string,
  query: z.infer<typeof pageQuery>
): Promise<{ rows: T[]; total: number | null; hasMore: boolean }> {
  if (query.limit === undefined) {
    const { rows } = await pool.query(`${sql};`, []);
    return { rows, total: null, hasMore: false };
  }
  const { rows: count } = await pool.query(countSql, []);
  const total = Number(count[0].n);
  const { rows } = await pool.query(`${sql} LIMIT $1 OFFSET $2;`, [query.limit, query.offset]);
  return { rows, total, hasMore: query.offset + rows.length < total };
}

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to 0-9, so phones typed on an Arabic keyboard match. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}
