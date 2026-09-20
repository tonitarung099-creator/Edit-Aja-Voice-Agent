import { ACCOUNTS_PER_PART, MAX_ACCOUNT_PAIRS, MAX_GOOGLE_PROFILES } from './constants.js';
import type { VoiceJob } from './types.js';

export function accountPairForOrdinal(ordinal: number, accountCount = MAX_GOOGLE_PROFILES) {
  const usable = Math.max(2, Math.min(accountCount, MAX_GOOGLE_PROFILES));
  const evenUsable = usable - (usable % ACCOUNTS_PER_PART);
  const pairCount = Math.max(1, Math.min(MAX_ACCOUNT_PAIRS, evenUsable / ACCOUNTS_PER_PART));
  const pairIndex = ((ordinal - 1) % pairCount);
  const accountA = pairIndex * 2 + 1;
  return { accountA, accountB: accountA + 1, pairIndex: pairIndex + 1 };
}

export function planJobs(partNumbers: number[], accountCount = MAX_GOOGLE_PROFILES): VoiceJob[] {
  const parts = [...new Set(partNumbers)].filter(n => Number.isInteger(n) && n > 0).sort((a,b) => a-b);
  return parts.map((partNumber, i) => {
    const pair = accountPairForOrdinal(i + 1, accountCount);
    return {
      partNumber,
      accountA: pair.accountA,
      accountB: pair.accountB,
      statusA: 'waiting',
      statusB: 'waiting',
    };
  });
}
