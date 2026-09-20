export type FailoverReason = 'browser_crash' | 'network_error' | 'session_expired' | 'ui_timeout' | 'provider_limit';

export function mayAutoFailover(reason: FailoverReason) {
  // Technical recovery is automatic. Provider-enforced quota/limit states are not rotated through automatically.
  return reason !== 'provider_limit';
}

export const AGENT_GUARDRAILS = [
  'Never download outside the configured download window.',
  'Never store Google passwords in the repository or local config.',
  'Use persistent Chrome profiles for Google sessions.',
  'Prefer deterministic local automation before spending Gemini API calls.',
  'Pause provider-limited accounts instead of rotating accounts to bypass provider limits.',
];
