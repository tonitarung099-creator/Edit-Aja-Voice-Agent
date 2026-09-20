export type AccountStatus = 'ready' | 'busy' | 'needs_login' | 'paused' | 'error';
export type JobStatus = 'waiting' | 'generating' | 'generated' | 'download_queued' | 'downloading' | 'done' | 'error';

export interface GoogleProfile {
  id: number;
  label: string;
  chromeProfileName: string;
  status: AccountStatus;
  note?: string;
}

export interface VoiceJob {
  partNumber: number;
  accountA: number;
  accountB: number;
  statusA: JobStatus;
  statusB: JobStatus;
}

export interface DownloadWindowState {
  open: boolean;
  localTime: string;
  label: string;
  nextLabel: string;
}
