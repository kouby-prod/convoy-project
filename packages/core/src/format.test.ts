import { describe, expect, it } from 'vitest';
import { formatTimestamp } from './format';

describe('formatTimestamp', () => {
  it('formats a Date as an ISO-8601 string', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    expect(formatTimestamp(date)).toBe('2026-01-01T00:00:00.000Z');
  });
});
