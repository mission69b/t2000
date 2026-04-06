export interface NotificationUser {
  userId: string;
  email: string;
  walletAddress: string;
  allowanceId: string | null;
  timezoneOffset: number;
  prefs: Record<string, boolean>;
}

export interface JobResult {
  job: string;
  processed: number;
  sent: number;
  errors: number;
}
