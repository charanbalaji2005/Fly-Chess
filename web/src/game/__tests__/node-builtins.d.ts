/**
 * Minimal declarations for the Node builtins used in tests.
 */

declare module 'node:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}

declare module 'node:assert' {
  interface AssertStrict {
    (value: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): void;
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    throws(fn: () => unknown, message?: string | Error): void;
    doesNotThrow(fn: () => unknown, message?: string | Error): void;
    match(value: string, pattern: RegExp, message?: string | Error): void;
    fail(message?: string | Error): never;
  }
  const assert: AssertStrict;
  export default assert;
}

declare module 'node:assert/strict' {
  interface AssertStrict {
    (value: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): void;
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    strictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    throws(fn: () => unknown, message?: string | Error): void;
    doesNotThrow(fn: () => unknown, message?: string | Error): void;
    match(value: string, pattern: RegExp, message?: string | Error): void;
    fail(message?: string | Error): never;
  }
  const assert: AssertStrict;
  export default assert;
}
