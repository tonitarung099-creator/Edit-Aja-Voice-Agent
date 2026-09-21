import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { DEFAULT_GEMINI_TTS_VOICE, GEMINI_TTS_VOICES, type GeminiTtsVoice } from '../shared/voices.js';

export interface AppSettings {
  voiceName: GeminiTtsVoice;
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): AppSettings {
  const fallback: AppSettings = { voiceName: DEFAULT_GEMINI_TTS_VOICE };
  const file = settingsPath();
  if (!fs.existsSync(file)) return fallback;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppSettings>;
    const voice = GEMINI_TTS_VOICES.includes(raw.voiceName as GeminiTtsVoice)
      ? raw.voiceName as GeminiTtsVoice
      : fallback.voiceName;
    return { voiceName: voice };
  } catch {
    return fallback;
  }
}

export function saveSettings(input: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next: AppSettings = { ...current };
  if (input.voiceName !== undefined) {
    if (!GEMINI_TTS_VOICES.includes(input.voiceName as GeminiTtsVoice)) {
      throw new Error('Voice Gemini tidak dikenal.');
    }
    next.voiceName = input.voiceName as GeminiTtsVoice;
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
