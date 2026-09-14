import base from './vitest.config.e2e';

export default {
  ...base,
  test: {
    ...base.test,
    include: ['test/service-scope-closure.e2e-spec.ts'],
    env: {
      DATABASE_URL: '', MIGRATION_DATABASE_URL: '', AUTH_STATE_PERSISTENCE: '',
      AUTH_JWT_SECRET_FILE: '', AUTH_JWT_SECRET: 'scope-closure-in-memory-test-only',
      AUTH_JWKS_URL: '', SUPABASE_JWKS_URL: '', AUTH_SEED_DEV_ADMIN: '',
      AUTH_DEV_PASSWORD_FILE: '', AUTH_DEV_PASSWORD: '', NODE_ENV: 'test',
    },
  },
};
