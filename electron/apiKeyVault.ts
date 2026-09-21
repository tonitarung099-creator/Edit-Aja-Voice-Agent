import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { GoogleGenAI } from '@google/genai';
import { MAX_GEMINI_API_KEYS } from '../shared/constants.js';

export type ApiKeyStatus = 'empty' | 'untested' | 'ready' | 'invalid' | 'provider_limited' | 'error';

interface StoredApiKey {
  slot: number;
  label: string;
  encryptedKey: string;
  status: Exclude<ApiKeyStatus, 'empty'>;
  lastMessage: string;
  updatedAt: string;
}

export interface ApiKeySummary {
  slot: number;
  label: string;
  configured: boolean;
  maskedKey: string;
  status: ApiKeyStatus;
  lastMessage: string;
  updatedAt: string | null;
}

function vaultPath() {
  return path.join(app.getPath('userData'), 'gemini-api-vault.json');
}

function requireEncryption() {
  if (!app.isReady() || !safeStorage.isEncryptionAvailable()) {
    throw new Error('Enkripsi Windows belum tersedia. Buka kembali aplikasi setelah Windows siap.');
  }
}

function readStored(): StoredApiKey[] {
  const file = vaultPath();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredApiKey[];
    return parsed.filter(x => Number.isInteger(x.slot) && x.slot >= 1 && x.slot <= MAX_GEMINI_API_KEYS);
  } catch {
    return [];
  }
}

function writeStored(records: StoredApiKey[]) {
  fs.mkdirSync(path.dirname(vaultPath()), { recursive: true });
  fs.writeFileSync(vaultPath(), JSON.stringify(records.sort((a,b)=>a.slot-b.slot), null, 2), 'utf8');
}

function encryptKey(key: string) {
  requireEncryption();
  return safeStorage.encryptString(key).toString('base64');
}

function decryptKey(record: StoredApiKey) {
  requireEncryption();
  return safeStorage.decryptString(Buffer.from(record.encryptedKey, 'base64'));
}

function maskKey(key: string) {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0,4)}…${key.slice(-4)}`;
}

export function listApiKeys(): ApiKeySummary[] {
  const bySlot = new Map(readStored().map(x => [x.slot, x]));
  return Array.from({ length: MAX_GEMINI_API_KEYS }, (_, i) => {
    const slot = i + 1;
    const record = bySlot.get(slot);
    if (!record) {
      return {
        slot,
        label: `API ${String(slot).padStart(3,'0')}`,
        configured: false,
        maskedKey: '',
        status: 'empty' as const,
        lastMessage: '',
        updatedAt: null,
      };
    }

    let maskedKey = '••••…••••';
    try { maskedKey = maskKey(decryptKey(record)); } catch {}

    return {
      slot,
      label: record.label,
      configured: true,
      maskedKey,
      status: record.status,
      lastMessage: record.lastMessage,
      updatedAt: record.updatedAt,
    };
  });
}

export function importApiKeys(keys: string[]): ApiKeySummary[] {
  requireEncryption();
  const clean = [...new Set(keys.map(k => k.trim()).filter(Boolean))];
  if (!clean.length) return listApiKeys();

  const records = readStored();
  const existingPlain = new Set<string>();
  for (const record of records) {
    try { existingPlain.add(decryptKey(record)); } catch {}
  }

  const freeSlots = Array.from({length:MAX_GEMINI_API_KEYS},(_,i)=>i+1)
    .filter(slot => !records.some(r => r.slot === slot));

  const newKeys = clean.filter(k => !existingPlain.has(k));
  if (newKeys.length > freeSlots.length) {
    throw new Error(`Slot API tidak cukup. Tersisa ${freeSlots.length} dari ${MAX_GEMINI_API_KEYS}.`);
  }

  newKeys.forEach((key,index) => {
    const slot = freeSlots[index];
    records.push({
      slot,
      label: `API ${String(slot).padStart(3,'0')}`,
      encryptedKey: encryptKey(key),
      status: 'untested',
      lastMessage: 'Belum dites.',
      updatedAt: new Date().toISOString(),
    });
  });
  writeStored(records);
  return listApiKeys();
}

export function removeApiKey(slot: number): ApiKeySummary[] {
  const next = readStored().filter(x => x.slot !== slot);
  writeStored(next);
  return listApiKeys();
}

export function getApiKey(slot: number): string | null {
  const record = readStored().find(x => x.slot === slot);
  if (!record) return null;
  return decryptKey(record);
}

export function configuredApiSlots() {
  return readStored().map(x => x.slot).sort((a,b)=>a-b);
}

export function setApiKeyStatus(slot: number, status: Exclude<ApiKeyStatus,'empty'>, message: string) {
  const records = readStored();
  const record = records.find(x => x.slot === slot);
  if (!record) return;
  record.status = status;
  record.lastMessage = message;
  record.updatedAt = new Date().toISOString();
  writeStored(records);
}

function classifyApiError(error: unknown) {
  const raw = error as { status?: number; code?: number|string; message?: string };
  const status = Number(raw?.status || raw?.code || 0);
  const message = String(raw?.message || error || 'Unknown Gemini API error');
  const lower = message.toLowerCase();

  if (status === 429 || /quota|rate.?limit|resource.?exhausted|too many requests/.test(lower)) {
    return { status: 'provider_limited' as const, message };
  }
  if (status === 401 || status === 403 || /api.?key.*invalid|invalid.*api.?key|permission denied/.test(lower)) {
    return { status: 'invalid' as const, message };
  }
  return { status: 'error' as const, message };
}

export async function testApiKey(slot: number, model = 'gemini-3.6-flash') {
  const key = getApiKey(slot);
  if (!key) throw new Error('Slot API kosong.');

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model,
      contents: 'Reply with exactly: OK',
    });
    const text = String(response.text || '').trim();
    setApiKeyStatus(slot, 'ready', text ? `OK · ${model}` : `Connected · ${model}`);
  } catch (error) {
    const classified = classifyApiError(error);
    setApiKeyStatus(slot, classified.status, classified.message);
  }
  return listApiKeys();
}

export { classifyApiError };
