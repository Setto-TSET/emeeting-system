module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testRegex: '\\.test\\.ts$',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
  // src/server.ts now pulls in routes/summarize -> services/claude.ts at require
  // time (createApp() mounts it). That file has a pre-existing, out-of-scope
  // @anthropic-ai/sdk type error (TS2339) that `tsc --noEmit` already reports
  // and that ts-jest would otherwise turn into a hard "test suite failed to
  // run" for every test that imports createApp. Ignoring only that one code
  // keeps every other type error fatal.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [2339] } }],
  },
  // stopgap: suites share one emeeting_test DB and do unscoped DELETE + reseed
  // in beforeAll, so Jest's default multi-worker pool corrupts fixtures across
  // suites (e.g. "Duplicate entry 'U-001'"). Forcing one worker serialises
  // them. The real fix is per-suite database isolation or transactional
  // rollback, tracked separately — this is not a considered design.
  maxWorkers: 1,
};
