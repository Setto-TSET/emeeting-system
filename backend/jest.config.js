module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testRegex: '\\.test\\.ts$',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
  // src/server.ts pulls in routes/summarize -> services/claude.ts at require
  // time (createApp() mounts it). services/claude.ts:44 calls
  // `client.messages.create(...)`, which the installed @anthropic-ai/sdk
  // (^0.10.0) predates — that SDK has no Messages API yet, hence TS2339.
  // This is a stopgap: delete it once the claude.ts SDK call is repaired
  // (tracked as a separate task).
  //
  // There is no CI and `npm test` is a bare `jest`, so this transform is the
  // only type-checking gate tests actually run through — a project-wide
  // ignore of TS2339 would hide real "no such property" bugs everywhere
  // else. `diagnostics.exclude` below scopes that to claude.ts alone: every
  // other file still gets full diagnostics, verified by deliberately
  // introducing a TS2339 in a different file and confirming ts-jest still
  // fails on it (see task-4-report.md). A two-entry transform map
  // (specific ignoreCodes:[2339] pattern for claude.ts + full-diagnostics
  // pattern for everything else) was tried first and did not work in this
  // ts-jest version — both entries resolved correctly per `--showConfig`,
  // but the claude.ts-specific options were not honored at runtime, even
  // with isolatedModules:true. `diagnostics.exclude` is the officially
  // documented ts-jest mechanism for excluding one file from typechecking
  // and was the option that actually worked.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { exclude: ['**/services/claude.ts'] } }],
  },
  // stopgap: suites share one emeeting_test DB and do unscoped DELETE + reseed
  // in beforeAll, so Jest's default multi-worker pool corrupts fixtures across
  // suites (e.g. "Duplicate entry 'U-001'"). Forcing one worker serialises
  // them. The real fix is per-suite database isolation or transactional
  // rollback, tracked separately — this is not a considered design.
  maxWorkers: 1,
};
