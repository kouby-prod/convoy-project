import { describe, expect, it, vi } from 'vitest';
import {
  buildNtfyBody,
  buildPagerDutyEvent,
  buildSentryEnvelope,
  ntfyPriority,
  ntfyPublishUrl,
  pagerDutyDedupKey,
  parseSentryDsn,
  postNtfyEvent,
  reportOncall,
  setOncallSinksForTests,
  severityForKind,
} from '../../src/observability';

describe('on-call routing', () => {
  it('pages refund, worker, and lost-dispute failures as critical', () => {
    expect(severityForKind('psp_refund_failed')).toBe('critical');
    expect(severityForKind('worker_job_failed')).toBe('critical');
    expect(severityForKind('dispute_lost')).toBe('critical');
    expect(severityForKind('dispute_open')).toBe('warning');
    expect(severityForKind('amount_drift')).toBe('error');
  });

  it('builds a PagerDuty trigger with a stable dedup key', () => {
    const body = buildPagerDutyEvent('RKEY', {
      kind: 'worker_job_failed',
      incidentId: 'inc_1',
      provider: 'stripe',
      providerPaymentId: 'pi_1',
    });
    expect(body.routing_key).toBe('RKEY');
    expect(body.event_action).toBe('trigger');
    expect(body.dedup_key).toBe('kouby:worker_job_failed:pi_1');
    expect(body.payload.severity).toBe('critical');
    expect(body.payload.summary).toContain('worker_job_failed');
  });

  it('prefers provider payment id, then invoice id, in the dedup key', () => {
    expect(
      pagerDutyDedupKey({ kind: 'amount_drift', incidentId: 'inc', invoiceId: 'inv_1' }),
    ).toBe('kouby:amount_drift:inv_1');
  });

  it('parses a Sentry DSN into the Envelope API URL', () => {
    expect(parseSentryDsn('https://abc123@o0.ingest.sentry.io/450111')).toEqual({
      envelopeUrl: 'https://o0.ingest.sentry.io/api/450111/envelope/',
      sentryKey: 'abc123',
      dsn: 'https://abc123@o0.ingest.sentry.io/450111',
    });
    expect(parseSentryDsn('https://abc123@o0.ingest.us.sentry.io/450111/')).toMatchObject({
      envelopeUrl: 'https://o0.ingest.us.sentry.io/api/450111/envelope/',
    });
    expect(parseSentryDsn('http://abc123@glitchtip:8000/1')).toEqual({
      envelopeUrl: 'http://glitchtip:8000/api/1/envelope/',
      sentryKey: 'abc123',
      dsn: 'http://abc123@glitchtip:8000/1',
    });
    expect(parseSentryDsn('not-a-url')).toBeNull();
  });

  it('POSTs an ntfy message with title and priority headers', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    await postNtfyEvent(
      'http://ntfy',
      'kouby-payments',
      { kind: 'psp_refund_failed', incidentId: 'inc', providerPaymentId: 'pi_1' },
      'tok',
      'http://localhost:3000',
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ntfy/kouby-payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Title: '[Kouby] psp_refund_failed',
          Priority: '5',
          Authorization: 'Bearer tok',
        }),
      }),
    );
  });

  it('maps incident severity onto ntfy priority and a topic URL', () => {
    expect(ntfyPriority('psp_refund_failed')).toBe('5');
    expect(ntfyPriority('amount_drift')).toBe('4');
    expect(ntfyPriority('dispute_open')).toBe('3');
    expect(ntfyPublishUrl('http://ntfy/', 'kouby-payments')).toBe('http://ntfy/kouby-payments');
    expect(buildNtfyBody({ kind: 'worker_job_failed', incidentId: 'inc', providerPaymentId: 'pi_1' })).toContain(
      'pi_1',
    );
  });

  it('packs an event as a Sentry envelope, not the deprecated store JSON', () => {
    const parsed = parseSentryDsn('https://abc123@o0.ingest.sentry.io/450111');
    expect(parsed).not.toBeNull();
    const body = buildSentryEnvelope(parsed!, { event_id: 'a'.repeat(32) });
    const lines = body.trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event_id: 'a'.repeat(32) });
    expect(JSON.parse(lines[1]!)).toMatchObject({ type: 'event' });
    expect(body).not.toContain('/store/');
  });

  it('reportOncall fans out to configured sinks', async () => {
    const sentry = vi.fn();
    const pager = vi.fn(async () => undefined);
    setOncallSinksForTests({ sentry, pager });
    const event = { kind: 'psp_refund_failed', incidentId: 'inc_2', providerPaymentId: 'pi_9' };
    await reportOncall(event);
    expect(sentry).toHaveBeenCalledWith(event);
    expect(pager).toHaveBeenCalledWith(event);
  });
});
