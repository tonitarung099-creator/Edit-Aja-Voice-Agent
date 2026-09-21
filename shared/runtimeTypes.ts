export type RuntimeJobStatus =
  | 'waiting'
  | 'opening'
  | 'needs_login'
  | 'filling'
  | 'prepared'
  | 'selecting_voice'
  | 'generating'
  | 'generated'
  | 'provider_limited'
  | 'error'
  | 'stopped';

export interface RuntimeVoiceJob {
  id: string;
  partNumber: number;
  accountSlot: number;
  pairSide: 'A' | 'B';
  sourcePath: string;
  sourceName: string;
  status: RuntimeJobStatus;
  message: string;
  windowHandle?: number;
  updatedAt: string;
}

export interface RuntimeSnapshot {
  running: boolean;
  inputFolder: string | null;
  startedAt: string | null;
  jobs: RuntimeVoiceJob[];
}
