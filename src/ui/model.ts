/**
 * Small shared UI-side types, kept separate from src/lib/types.ts (which
 * is the cross-module contract and must not change).
 */

/** The four free-text cover fields, exactly as typed (untrimmed). */
export interface CoverFields {
  instructor: string;
  email: string;
  officeHours: string;
  meetingTimes: string;
}

export type CoverField = keyof CoverFields;

export const COVER_FIELDS: readonly CoverField[] = ['instructor', 'email', 'officeHours', 'meetingTimes'];
