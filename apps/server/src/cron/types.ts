// [SIMPLIFICATION DAY 5 — audit catch-up] NotificationUser shape slimmed to
// match the new /api/internal/notification-users payload. Dropped fields:
//   - email, timezoneOffset (no cron emails users anymore)
//   - allowanceId (UserPreferences.allowanceId column dropped)
//   - prefs (NotificationPrefs table dropped)
// Only the silent-infra crons consume this, and they only need an id +
// wallet to iterate.
export interface NotificationUser {
  userId: string;
  walletAddress: string;
}

export interface JobResult {
  job: string;
  processed: number;
  sent: number;
  errors: number;
}
