import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { MAX_GOOGLE_PROFILES } from '../shared/constants.js';

export interface StoredProfile {
  slot: number;
  label: string;
  chromeProfileName: string;
  enabled: boolean;
}

function registryPath() {
  return path.join(app.getPath('userData'), 'profiles.json');
}

export function loadProfiles(): StoredProfile[] {
  const file = registryPath();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredProfile[];
    return parsed.filter(p => Number.isInteger(p.slot) && p.slot >= 1 && p.slot <= MAX_GOOGLE_PROFILES);
  } catch {
    return [];
  }
}

export function saveProfile(profile: StoredProfile): StoredProfile[] {
  if (!Number.isInteger(profile.slot) || profile.slot < 1 || profile.slot > MAX_GOOGLE_PROFILES) {
    throw new Error(`Slot akun harus 1-${MAX_GOOGLE_PROFILES}.`);
  }
  if (!profile.chromeProfileName.trim()) {
    throw new Error('Chrome profile wajib dipilih.');
  }
  const current = loadProfiles().filter(p => p.slot !== profile.slot);
  current.push({
    slot: profile.slot,
    label: profile.label.trim() || `VO${String(profile.slot).padStart(2, '0')}`,
    chromeProfileName: profile.chromeProfileName.trim(),
    enabled: profile.enabled !== false,
  });
  current.sort((a,b) => a.slot - b.slot);
  fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify(current, null, 2), 'utf8');
  return current;
}

export function removeProfile(slot: number): StoredProfile[] {
  const next = loadProfiles().filter(p => p.slot !== slot);
  fs.mkdirSync(path.dirname(registryPath()), { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
