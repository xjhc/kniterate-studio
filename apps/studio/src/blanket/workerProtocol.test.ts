import { describe, expect, it } from 'vitest';
import { isCurrentCompileResponse } from './workerProtocol';

describe('blanket compile Worker authority', () => {
  it('rejects a completed result after a newer project revision was requested', () => {
    const stale = { kind: 'compile-failed' as const, requestId: 4, error: 'old result' };
    expect(isCurrentCompileResponse(5, stale)).toBe(false);
    expect(isCurrentCompileResponse(4, stale)).toBe(true);
  });
});
