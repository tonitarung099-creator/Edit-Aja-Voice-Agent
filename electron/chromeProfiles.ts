import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ChromeProfileCandidate {
  directory: string;
  name: string;
}

export function discoverChromeProfiles(): ChromeProfileCandidate[] {
  if (process.platform !== 'win32') return [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const localState = path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Local State');
  if (!fs.existsSync(localState)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(localState, 'utf8'));
    const info = parsed?.profile?.info_cache ?? {};
    return Object.entries(info).map(([directory, value]) => ({
      directory,
      name: String((value as {name?: string})?.name ?? directory),
    })).sort((a,b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
