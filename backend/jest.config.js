module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testRegex: '\\.test\\.ts$',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
  },
  // stopgap: suites share one emeeting_test DB and do unscoped DELETE + reseed
  // in beforeAll, so Jest's default multi-worker pool corrupts fixtures across
  // suites (e.g. "Duplicate entry 'U-001'"). Forcing one worker serialises
  // them. The real fix is per-suite database isolation or transactional
  // rollback, tracked separately — this is not a considered design.
  maxWorkers: 1,
};
