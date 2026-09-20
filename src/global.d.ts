export {};
declare global {
  interface Window {
    voiceAgent?: {
      getRuntimeState: () => Promise<{maxGoogleProfiles:number;maxGeminiApiKeys:number;version:string}>;
      getDownloadWindow: () => Promise<{open:boolean;localTime:string;label:string;nextLabel:string}>;
    };
  }
}
