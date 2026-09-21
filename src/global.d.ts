export {};

type StoredProfile = {
  slot: number;
  label: string;
  chromeProfileName: string;
  enabled: boolean;
};

type ChromeProfileCandidate = {
  directory: string;
  name: string;
};

type RuntimeVoiceJob = {
  id: string;
  partNumber: number;
  accountSlot: number;
  pairSide: 'A' | 'B';
  sourcePath: string;
  sourceName: string;
  status: 'waiting' | 'opening' | 'needs_login' | 'filling' | 'prepared' | 'selecting_voice' | 'generating' | 'generated' | 'downloading' | 'downloaded' | 'download_error' | 'provider_limited' | 'error' | 'stopped';
  message: string;
  windowHandle?: number;
  outputPath?: string;
  updatedAt: string;
};

type RuntimeSnapshot = {
  running: boolean;
  inputFolder: string | null;
  startedAt: string | null;
  jobs: RuntimeVoiceJob[];
};

type ApiKeySummary = {
  slot: number;
  label: string;
  configured: boolean;
  maskedKey: string;
  status: 'empty' | 'untested' | 'ready' | 'invalid' | 'provider_limited' | 'error';
  lastMessage: string;
  updatedAt: string | null;
};

type AgentReply = {
  text: string;
  source: 'local' | 'gemini';
  action: 'status' | 'scan' | 'start' | 'stop' | 'set_voice' | 'download_queue' | 'none';
};

declare global {
  interface Window {
    voiceAgent?: {
      getRuntimeState: () => Promise<{maxGoogleProfiles:number;maxGeminiApiKeys:number;version:string}>;
      getDownloadWindow: () => Promise<{open:boolean;localTime:string;label:string;nextLabel:string}>;
      listProfiles: () => Promise<StoredProfile[]>;
      discoverChromeProfiles: () => Promise<ChromeProfileCandidate[]>;
      saveProfile: (profile: StoredProfile) => Promise<StoredProfile[]>;
      removeProfile: (slot: number) => Promise<StoredProfile[]>;
      getSettings: () => Promise<{voiceName:string}>;
      saveSettings: (settings: {voiceName:string}) => Promise<{voiceName:string}>;

      listApiKeys: () => Promise<ApiKeySummary[]>;
      importApiKeys: (keys: string[]) => Promise<ApiKeySummary[]>;
      removeApiKey: (slot: number) => Promise<ApiKeySummary[]>;
      testApiKey: (slot: number) => Promise<ApiKeySummary[]>;
      agentChat: (message: string) => Promise<AgentReply>;

      chooseInputFolder: () => Promise<string | null>;
      scanInput: (folder: string) => Promise<RuntimeSnapshot>;
      startWorkflow: (folder: string) => Promise<RuntimeSnapshot>;
      stopWorkflow: () => Promise<RuntimeSnapshot>;
      getWorkflow: () => Promise<RuntimeSnapshot>;
      onRuntimeUpdate: (callback: (snapshot: RuntimeSnapshot) => void) => void;
    };
  }
}
