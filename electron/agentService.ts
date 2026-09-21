import { GoogleGenAI } from '@google/genai';
import type { JobController } from './jobController.js';
import { configuredApiSlots, getApiKey, setApiKeyStatus, classifyApiError } from './apiKeyVault.js';
import { loadSettings, saveSettings } from './settingsStore.js';
import { GEMINI_TTS_VOICES } from '../shared/voices.js';
import { getDownloadWindowState } from '../shared/downloadWindow.js';

type AgentAction = 'status' | 'scan' | 'start' | 'stop' | 'set_voice' | 'download_queue' | 'none';

interface AgentDecision {
  action: AgentAction;
  voiceName?: string;
  reply?: string;
}

export interface AgentReply {
  text: string;
  source: 'local' | 'gemini';
  action: AgentAction;
}

function summarize(controller: JobController) {
  const s = controller.getSnapshot();
  const counts = new Map<string,number>();
  for (const job of s.jobs) counts.set(job.status, (counts.get(job.status) || 0) + 1);
  return {
    inputFolder: s.inputFolder,
    running: s.running,
    totalJobs: s.jobs.length,
    statuses: Object.fromEntries(counts),
    voiceName: loadSettings().voiceName,
    downloadWindow: getDownloadWindowState(),
  };
}

function localIntent(message: string): AgentDecision | null {
  const lower = message.trim().toLowerCase();

  if (/^(status|cek status|gimana|sekarang gimana|progress|progres)[?.! ]*$/.test(lower)) return { action:'status' };
  if (/^(stop|berhenti|hentikan|stop semua)[!. ]*$/.test(lower)) return { action:'stop' };
  if (/^(scan|scan lagi|cek part|baca part)[!. ]*$/.test(lower)) return { action:'scan' };
  if (/^(mulai|mulai semua|lanjut|lanjutkan|lanjutkan semua)[!. ]*$/.test(lower)) return { action:'start' };
  if (/download/i.test(lower)) return { action:'download_queue' };

  const voice = GEMINI_TTS_VOICES.find(v => lower === `voice ${v.toLowerCase()}` || lower === `pakai voice ${v.toLowerCase()}`);
  if (voice) return { action:'set_voice', voiceName:voice };
  return null;
}

function parseDecision(text: string): AgentDecision {
  const cleaned = text.trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  const parsed = JSON.parse(cleaned) as AgentDecision;
  const allowed:AgentAction[] = ['status','scan','start','stop','set_voice','download_queue','none'];
  if (!allowed.includes(parsed.action)) return { action:'none', reply:'Perintah AI tidak termasuk action yang diizinkan.' };
  if (parsed.action === 'set_voice' && !GEMINI_TTS_VOICES.includes(parsed.voiceName as any)) {
    return { action:'none', reply:'Voice yang diminta tidak tersedia.' };
  }
  return parsed;
}

export class AgentService {
  constructor(private controller: JobController) {}

  async handle(message: string): Promise<AgentReply> {
    const local = localIntent(message);
    if (local) return this.execute(local, 'local');
    const decision = await this.askGemini(message);
    return this.execute(decision, 'gemini');
  }

  private async askGemini(message: string): Promise<AgentDecision> {
    const slots = configuredApiSlots();
    if (!slots.length) {
      return {
        action:'none',
        reply:'Perintah ini membutuhkan Gemini, tetapi belum ada API key di 100 API Pool. Perintah sederhana seperti status, scan, mulai, stop, download, atau memilih voice tetap bisa dipakai tanpa API.',
      };
    }

    const state = summarize(this.controller);
    const prompt = `You are the intent router for Edit Aja Voice Agent.
Return JSON only, no markdown.
Allowed action values: status, scan, start, stop, set_voice, download_queue, none.
Never invent another action.
Never override the download rule: downloads may only start 04:30 <= Asia/Jakarta time < 05:05.
If the user asks to bypass a provider quota/limit, action must be none.
For set_voice, voiceName must be one of: ${GEMINI_TTS_VOICES.join(', ')}.

Current state:
${JSON.stringify(state)}

User message:
${JSON.stringify(message)}

Output shape:
{"action":"status","reply":"optional short Indonesian reply"}`;

    for (const slot of slots) {
      const key = getApiKey(slot);
      if (!key) continue;
      try {
        const ai = new GoogleGenAI({ apiKey:key });
        const response = await ai.models.generateContent({
          model:'gemini-3.6-flash',
          contents:prompt,
          config:{ responseMimeType:'application/json' },
        });
        setApiKeyStatus(slot, 'ready', 'Agent request OK · gemini-3.6-flash');
        return parseDecision(String(response.text || '{"action":"none"}'));
      } catch (error) {
        const classified = classifyApiError(error);
        setApiKeyStatus(slot, classified.status, classified.message);
        if (classified.status === 'provider_limited') {
          return { action:'none', reply:'Gemini API melaporkan quota/rate limit. Agent tidak memutar key lain untuk melewati batas provider.' };
        }
        if (classified.status === 'invalid') continue;
        return { action:'none', reply:`Gemini API error: ${classified.message}` };
      }
    }
    return { action:'none', reply:'Tidak ada API key valid yang tersedia.' };
  }

  private async execute(decision: AgentDecision, source:'local'|'gemini'): Promise<AgentReply> {
    const snapshot = this.controller.getSnapshot();
    switch (decision.action) {
      case 'status': {
        const s = summarize(this.controller);
        const statuses = Object.entries(s.statuses).map(([k,v])=>`${k}: ${v}`).join(', ') || 'belum ada job';
        return { source, action:'status', text:`Status: ${s.totalJobs} VO job · ${statuses}. Voice: ${s.voiceName}. Download ${s.downloadWindow.open ? 'OPEN' : 'LOCKED'} (${s.downloadWindow.localTime} WIB).` };
      }
      case 'stop':
        this.controller.stop();
        return { source, action:'stop', text:'Workflow dihentikan.' };
      case 'scan':
        if (!snapshot.inputFolder) return { source, action:'scan', text:'Belum ada folder INPUT PART yang dipilih.' };
        this.controller.scan(snapshot.inputFolder);
        return { source, action:'scan', text:'Folder INPUT PART sudah discan ulang.' };
      case 'start':
        if (!snapshot.inputFolder) return { source, action:'start', text:'Pilih folder INPUT PART terlebih dahulu.' };
        if (snapshot.running) return { source, action:'start', text:'Workflow sudah sedang berjalan.' };
        void this.controller.start(snapshot.inputFolder);
        return { source, action:'start', text:'Workflow mulai dijalankan. Status akan diperbarui di dashboard.' };
      case 'set_voice':
        if (!decision.voiceName) return { source, action:'none', text:'Nama voice belum ditentukan.' };
        saveSettings({voiceName:decision.voiceName as any});
        return { source, action:'set_voice', text:`Voice diubah ke ${decision.voiceName}.` };
      case 'download_queue': {
        const w = getDownloadWindowState();
        if (!w.open) return { source, action:'download_queue', text:`Download terkunci. Jendela berikutnya: ${w.nextLabel} WIB.` };
        void this.controller.tickDownloadScheduler();
        return { source, action:'download_queue', text:'Download Manager menjalankan antrean yang sudah Generated.' };
      }
      default:
        return { source, action:'none', text:decision.reply || 'Saya belum mempunyai action lokal yang aman untuk perintah itu.' };
    }
  }
}
