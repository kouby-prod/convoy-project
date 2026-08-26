import { z } from 'zod';

/** Cooling-off before a requested account wipe is irreversible. */
export const ACCOUNT_DELETION_RETENTION_DAYS = 30;

export const ScheduleAccountDeletionSchema = z
  .object({
    password: z.string().min(8).optional(),
  })
  .describe('ScheduleAccountDeletion');
export type ScheduleAccountDeletion = z.infer<typeof ScheduleAccountDeletionSchema>;

export const AccountDeletionStatusSchema = z
  .object({
    scheduled: z.boolean(),
    requestedAt: z.string().nullable().describe('ISO-8601 timestamp'),
    purgeAt: z.string().nullable().describe('ISO-8601 timestamp'),
    retentionDays: z.number().int().positive(),
    passwordRequired: z.boolean(),
  })
  .describe('AccountDeletionStatus');
export type AccountDeletionStatus = z.infer<typeof AccountDeletionStatusSchema>;
