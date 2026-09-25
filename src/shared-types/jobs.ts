import type { DefaultJobOptions } from 'bullmq';

export const INBOUND_QUEUE = 'whatsapp-inbound';
export const OUTBOUND_QUEUE = 'whatsapp-outbound';

/** Raw Meta webhook body, already signature-verified by the gateway. Parsed by the worker. */
export interface InboundJob {
  payload: unknown;
  receivedAt: string;
}

export interface OutboundJob {
  messageId: string;
}

export const JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
