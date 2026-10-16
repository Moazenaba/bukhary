import fs from 'fs';

export interface AppConfig {
  nodeEnv: 'production' | 'development' | 'test';
  isProduction: boolean;
  port: number;
  databaseUrl: string | undefined;
  /** PEM of the CA that signs the database certificate (Supabase publishes one). */
  databaseCaCert: string | undefined;
  /** Only for local databases without TLS. Never set in production. */
  databaseSslDisabled: boolean;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
  geminiApiKey: string | undefined;
  geminiModel: string;
  trustProxy: string | number | boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  /** After an admin password reset, block everything except account endpoints until the user sets a new one. */
  enforcePasswordChange: boolean;
  /** Reject unknown permission ids with 400 instead of dropping them (turn on once all clients send ids only). */
  strictPermissionIds: boolean;
  /** Accept stage changes through PATCH /api/committees/:id (older Android builds); new clients use /actions. */
  legacyStagePatch: boolean;
  /** Requests per minute per IP across the whole API (0 disables the limiter). */
  apiRateLimitPerMinute: number;
  /**
   * Oldest Android versionCode the server accepts (0 = any). Raised after a release whose old
   * builds would send requests the server now refuses (rollout plan in docs/RELEASE.md).
   */
  minAndroidVersionCode: number;
}

const DEV_JWT_SECRET = 'bukhari_dev_only_secret';
const PLACEHOLDER_SECRETS = new Set(['', 'your_jwt_secret_here_change_me', DEV_JWT_SECRET]);

function buildDatabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  // Older variable names kept so existing deployments keep working.
  if (env.SUPABASE_URL?.startsWith('postgres')) return env.SUPABASE_URL;
  if (env.SUPABASE_DB_HOST) {
    const user = env.SUPABASE_DB_USER || 'postgres';
    const password = encodeURIComponent(env.SUPABASE_DB_PASSWORD || '');
    return `postgresql://${user}:${password}@${env.SUPABASE_DB_HOST}:${env.SUPABASE_DB_PORT || '5432'}/postgres`;
  }
  return undefined;
}

function parseTrustProxy(value: string | undefined): string | number | boolean {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

/** `requireSecrets: false` is for CLI scripts (migrate, create-admin) that never sign tokens. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, opts: { requireSecrets?: boolean } = {}): AppConfig {
  const requireSecrets = opts.requireSecrets ?? true;
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const isProduction = nodeEnv === 'production';

  const jwtSecret = env.JWT_SECRET ?? '';
  if (PLACEHOLDER_SECRETS.has(jwtSecret) || jwtSecret.length < 32) {
    // A known or short secret would let anyone forge admin tokens. Only automated tests may use
    // the built-in development secret; local development needs its own JWT_SECRET too.
    if (nodeEnv !== 'test' && requireSecrets) {
      throw new Error('JWT_SECRET must be set to a random value of at least 32 characters (see .env.example).');
    }
  }

  const caPath = env.DATABASE_CA_CERT_PATH;
  const databaseCaCert = env.DATABASE_CA_CERT || (caPath ? fs.readFileSync(caPath, 'utf8') : undefined);
  const databaseSslDisabled = env.DATABASE_SSL === 'disable';
  if (isProduction && databaseSslDisabled) {
    throw new Error('DATABASE_SSL=disable is not allowed in production.');
  }

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT) || 3000,
    databaseUrl: buildDatabaseUrl(env),
    databaseCaCert,
    databaseSslDisabled,
    jwtSecret: jwtSecret.length >= 32 ? jwtSecret : DEV_JWT_SECRET.padEnd(32, '_'),
    accessTokenTtl: env.ACCESS_TOKEN_TTL || '15m',
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS) || 30,
    geminiApiKey: env.GEMINI_API_KEY || env.API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    maxLoginAttempts: Number(env.MAX_LOGIN_ATTEMPTS) || 5,
    lockoutMinutes: Number(env.LOCKOUT_MINUTES) || 15,
    enforcePasswordChange: env.ENFORCE_PASSWORD_CHANGE !== 'false',
    strictPermissionIds: env.STRICT_PERMISSION_IDS === 'true',
    legacyStagePatch: env.LEGACY_STAGE_PATCH !== 'false',
    apiRateLimitPerMinute: env.API_RATE_LIMIT_PER_MINUTE === undefined ? 600 : Number(env.API_RATE_LIMIT_PER_MINUTE) || 0,
    minAndroidVersionCode: Number(env.MIN_ANDROID_VERSION_CODE) || 0,
  };
}
