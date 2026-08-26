import { randomUUID } from 'crypto';
import { env } from './env';

export type OncallEvent = {
  kind: string;
  incidentId: string;
  provider?: string | null;
  providerPaymentId?: string | null;
  invoiceId?: string | null;
  detail?: unknown;
  error?: unknown;
};

export type OncallSeverity = 'warning' | 'error' | 'critical';

const PAGERDUTY_ENQUEUE_URL = 'https://events.pagerduty.com/v2/enqueue';

export function severityForKind(kind: string): OncallSeverity {
  if (kind === 'dispute_open') return 'warning';
  if (kind === 'psp_refund_failed' || kind === 'worker_job_failed' || kind === 'dispute_lost') {
    return 'critical';
  }
  return 'error';
}

export function pagerDutyDedupKey(event: OncallEvent): string {
  const id = event.providerPaymentId ?? event.invoiceId ?? event.incidentId;
  return `kouby:${event.kind}:${id}`.slice(0, 255);
}

export function buildPagerDutyEvent(routingKey: string, event: OncallEvent) {
  const severity = severityForKind(event.kind);
  return {
    routing_key: routingKey,
    event_action: 'trigger' as const,
    dedup_key: pagerDutyDedupKey(event),
    payload: {
      summary: `[Kouby] payment incident: ${event.kind}`,
      severity,
      source: 'kouby-payments',
      component: event.provider ?? 'payments',
      custom_details: {
        incidentId: event.incidentId,
        provider: event.provider,
        providerPaymentId: event.providerPaymentId,
        invoiceId: event.invoiceId,
        detail: event.detail,
      },
    },
  };
}

export type ParsedSentryDsn = {
  envelopeUrl: string;
  sentryKey: string;
  dsn: string;
};

/** `https://<publicKey>@<host>/<projectId>` → Envelope API URL + auth key. */
export function parseSentryDsn(dsn: string): ParsedSentryDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
    const sentryKey = decodeURIComponent(url.username);
    if (!projectId || !sentryKey) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      sentryKey,
      dsn: dsn.trim(),
    };
  } catch {
    return null;
  }
}

export function buildSentryEvent(service: string, environment: string, event: OncallEvent) {
  const err = event.error instanceof Error ? event.error : undefined;
  return {
    event_id: randomUUID().replaceAll('-', ''),
    timestamp: Date.now() / 1000,
    platform: 'node',
    logger: 'kouby.payments',
    server_name: service,
    environment,
    sdk: { name: 'kouby-api', version: '1.0.0' },
    message: `[Kouby] payment incident: ${event.kind}`,
    level: severityForKind(event.kind) === 'warning' ? 'warning' : 'error',
    tags: { kind: event.kind, service },
    extra: {
      incidentId: event.incidentId,
      provider: event.provider,
      providerPaymentId: event.providerPaymentId,
      invoiceId: event.invoiceId,
      detail: event.detail,
    },
    exception: err
      ? {
          values: [
            {
              type: err.name,
              value: err.message,
            },
          ],
        }
      : undefined,
  };
}

/** Newline-delimited envelope: header, item header, event JSON. */
export function buildSentryEnvelope(parsed: ParsedSentryDsn, eventPayload: { event_id: string }): string {
  const eventJson = JSON.stringify(eventPayload);
  const header = JSON.stringify({
    event_id: eventPayload.event_id,
    sent_at: new Date().toISOString(),
    dsn: parsed.dsn,
  });
  const itemHeader = JSON.stringify({
    type: 'event',
    content_type: 'application/json',
    length: Buffer.byteLength(eventJson, 'utf8'),
  });
  return `${header}\n${itemHeader}\n${eventJson}\n`;
}

type OncallSinks = {
  sentry?: (event: OncallEvent) => void | Promise<void>;
  pager?: (event: OncallEvent) => Promise<void>;
};

let sinks: OncallSinks = {};
let initialized = false;

export async function postSentryEnvelope(
  parsed: ParsedSentryDsn,
  body: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(parsed.envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=kouby-api/1.0, sentry_key=${parsed.sentryKey}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sentry envelope ${res.status}: ${text.slice(0, 300)}`);
  }
}

export function ntfyPriority(kind: string): string {
  const severity = severityForKind(kind);
  if (severity === 'critical') return '5';
  if (severity === 'warning') return '3';
  return '4';
}

export function ntfyPublishUrl(baseUrl: string, topic: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(topic)}`;
}

export function buildNtfyBody(event: OncallEvent, origin?: string): string {
  return [
    `Payment incident: ${event.kind}`,
    event.providerPaymentId ? `Payment: ${event.providerPaymentId}` : '',
    event.invoiceId ? `Invoice: ${event.invoiceId}` : '',
    origin ? `Admin: ${origin}/admin` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function postNtfyEvent(
  baseUrl: string,
  topic: string,
  event: OncallEvent,
  token?: string,
  origin?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const headers: Record<string, string> = {
    Title: `[Kouby] ${event.kind}`,
    Priority: ntfyPriority(event.kind),
    Tags: 'warning,money',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(ntfyPublishUrl(baseUrl, topic), {
    method: 'POST',
    headers,
    body: buildNtfyBody(event, origin),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ntfy publish ${res.status}: ${text.slice(0, 300)}`);
  }
}

export async function postPagerDutyEvent(
  routingKey: string,
  event: OncallEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(PAGERDUTY_ENQUEUE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPagerDutyEvent(routingKey, event)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PagerDuty enqueue ${res.status}: ${text.slice(0, 300)}`);
  }
}

/**
 * Optional GlitchTip/Sentry envelope ingest + ntfy (or PagerDuty) paging.
 * No-op when DSN / ntfy URL are unset.
 */
export function initObservability(service: 'api' | 'payment-worker'): void {
  if (initialized) return;
  initialized = true;

  const parsed = env.SENTRY_DSN ? parseSentryDsn(env.SENTRY_DSN) : null;
  if (env.SENTRY_DSN && !parsed) {
    console.error('[observability] SENTRY_DSN is set but not a valid DSN');
  }
  if (parsed) {
    const environment = env.SENTRY_ENVIRONMENT ?? 'development';
    sinks.sentry = (event) => {
      const payload = buildSentryEvent(service, environment, event);
      return postSentryEnvelope(parsed, buildSentryEnvelope(parsed, payload)).catch((err: unknown) => {
        console.error('[observability] sentry envelope failed', err);
      });
    };
  }

  if (env.NTFY_URL && env.NTFY_TOPIC) {
    const ntfyUrl = env.NTFY_URL;
    const topic = env.NTFY_TOPIC;
    const token = env.NTFY_TOKEN;
    sinks.pager = (event) =>
      postNtfyEvent(ntfyUrl, topic, event, token, env.TRUSTED_ORIGINS[0]);
  } else if (env.PAGERDUTY_ROUTING_KEY) {
    const routingKey = env.PAGERDUTY_ROUTING_KEY;
    sinks.pager = (event) => postPagerDutyEvent(routingKey, event);
  }

  console.log(
    `[observability] service=${service} sentry=${parsed ? 'on' : 'off'} ntfy=${env.NTFY_URL && env.NTFY_TOPIC ? 'on' : 'off'}`,
  );
}

/** Test seam — swap sinks without booting HTTP clients. */
export function setOncallSinksForTests(next: OncallSinks): void {
  sinks = next;
  initialized = true;
}

export async function reportOncall(event: OncallEvent): Promise<void> {
  try {
    await sinks.sentry?.(event);
  } catch (err) {
    console.error('[observability] sentry capture failed', err);
  }
  if (sinks.pager) {
    await sinks.pager(event).catch((err: unknown) => {
      console.error('[observability] pager publish failed', err);
    });
  }
}
