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

declare global {
  interface Window {
    voiceAgent?: {
      getRuntimeState: () => Promise<{maxGoogleProfiles:number;maxGeminiApiKeys:number;version:string}>;
      getDownloadWindow: () => Promise<{open:boolean;localTime:string;label:string;nextLabel:string}>;
      listProfiles: () => Promise<StoredProfile[]>;
      discoverChromeProfiles: () => Promise<ChromeProfileCandidate[]>;
      saveProfile: (profile: StoredProfile) => Promise<StoredProfile[]>;
      removeProfile: (slot: number) => Promise<StoredProfile[]>;
    };
  }
}
