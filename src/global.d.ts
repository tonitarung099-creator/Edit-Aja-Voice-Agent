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
  status: 'waiting' | 'opening' | 'needs_login' | 'filling' | 'prepared' | 'error' | 'stopped';
  message: string;
  windowHandle?: number;
  updatedAt: string;
};

type RuntimeSnapshot = {
  running: boolean;
  inputFolder: string | null;
  startedAt: string | null;
  jobs: RuntimeVoiceJob[];
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

      chooseInputFolder: () => Promise<string | null>;
      scanInput: (folder: string) => Promise<RuntimeSnapshot>;
      startWorkflow: (folder: string) => Promise<RuntimeSnapshot>;
      stopWorkflow: () => Promise<RuntimeSnapshot>;
      getWorkflow: () => Promise<RuntimeSnapshot>;
      onRuntimeUpdate: (callback: (snapshot: RuntimeSnapshot) => void) => void;
    };
  }
}
