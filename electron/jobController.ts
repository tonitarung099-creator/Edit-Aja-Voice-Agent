import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { loadProfiles } from './profileRegistry.js';
import { loadSettings } from './settingsStore.js';
import { runProcess } from './processUtils.js';
import { scanPartFolder } from './inputScanner.js';
import { MAX_GOOGLE_PROFILES } from '../shared/constants.js';
import type { RuntimeSnapshot, RuntimeVoiceJob } from '../shared/runtimeTypes.js';

const TARGET_URL = 'https://aistudio.google.com/generate-speech?model=gemini-2.5-pro-preview-tts';
const PREPARE_BATCH_SIZE = 6;

function nowIso() { return new Date().toISOString(); }

function parseJsonPayload(stdout: string) {
  const lines = stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

export class JobController {
  private snapshot: RuntimeSnapshot = {
    running: false,
    inputFolder: null,
    startedAt: null,
    jobs: [],
  };
  private aborter: AbortController | null = null;

  getSnapshot(): RuntimeSnapshot {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  scan(inputFolder: string) {
    const parts = scanPartFolder(inputFolder);
    const profiles = new Map(loadProfiles().filter(p => p.enabled).map(p => [p.slot, p]));
    const jobs: RuntimeVoiceJob[] = [];

    parts.forEach((part, index) => {
      const pairIndex = index % (MAX_GOOGLE_PROFILES / 2);
      const accountA = pairIndex * 2 + 1;
      const accountB = accountA + 1;
      for (const [accountSlot, pairSide] of [[accountA, 'A'], [accountB, 'B']] as const) {
        const configured = profiles.has(accountSlot);
        jobs.push({
          id: `part-${part.partNumber}-vo-${accountSlot}`,
          partNumber: part.partNumber,
          accountSlot,
          pairSide,
          sourcePath: part.fullPath,
          sourceName: part.name,
          status: configured ? 'waiting' : 'error',
          message: configured ? 'Menunggu batch' : `VO${String(accountSlot).padStart(2,'0')} belum dikonfigurasi`,
          updatedAt: nowIso(),
        });
      }
    });

    this.snapshot = {
      running: false,
      inputFolder,
      startedAt: null,
      jobs,
    };
    this.emit();
    return this.getSnapshot();
  }

  async start(inputFolder: string) {
    if (this.snapshot.running) throw new Error('Workflow sedang berjalan.');

    this.scan(inputFolder);
    if (!this.snapshot.jobs.length) {
      throw new Error('Tidak ditemukan file Part. Nama file harus mengandung Part1, Part2, dan seterusnya.');
    }

    const blocked = this.snapshot.jobs.filter(j => j.status === 'error');
    if (blocked.length) {
      throw new Error(`${blocked.length} voice job belum punya Chrome profile. Lengkapi tab 50 Accounts terlebih dahulu.`);
    }

    const batch = this.snapshot.jobs.slice(0, PREPARE_BATCH_SIZE);
    for (const job of this.snapshot.jobs.slice(PREPARE_BATCH_SIZE)) {
      job.message = 'Menunggu batch berikutnya setelah deteksi Generate selesai aktif';
      job.updatedAt = nowIso();
    }

    this.snapshot.running = true;
    this.snapshot.startedAt = nowIso();
    this.aborter = new AbortController();
    this.emit();

    try {
      // Launch sequentially so HWND detection cannot race. Once Generate is clicked,
      // that window may keep working while the next account is prepared.
      for (let i = 0; i < batch.length; i++) {
        if (this.aborter.signal.aborted) break;
        await this.prepareAndGenerateOne(batch[i], i + 1, this.aborter.signal);
      }
    } finally {
      this.snapshot.running = false;
      this.aborter = null;
      this.emit();
    }
    return this.getSnapshot();
  }

  stop() {
    this.aborter?.abort();
    for (const job of this.snapshot.jobs) {
      if (['opening','filling','prepared','selecting_voice'].includes(job.status)) {
        job.status = 'stopped';
        job.message = 'Dihentikan pengguna';
        job.updatedAt = nowIso();
      }
    }
    this.snapshot.running = false;
    this.emit();
    return this.getSnapshot();
  }

  private async prepareAndGenerateOne(job: RuntimeVoiceJob, layoutSlot: number, signal: AbortSignal) {
    const profile = loadProfiles().find(p => p.slot === job.accountSlot && p.enabled);
    if (!profile) {
      this.patch(job, 'error', 'Chrome profile tidak ditemukan.');
      return;
    }

    this.patch(job, 'opening', `Membuka ${profile.label} dan AI Studio…`);
    const prepareResult = await runProcess('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', this.workerPath('aiStudioPrepare.ps1'),
      '-ProfileDirectory', profile.chromeProfileName,
      '-LayoutSlot', String(layoutSlot),
      '-InputFile', job.sourcePath,
      '-TargetUrl', TARGET_URL,
    ], signal).catch(error => ({
      exitCode: -1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    }));

    if (signal.aborted) {
      this.patch(job, 'stopped', 'Dihentikan pengguna');
      return;
    }

    const prepare = parseJsonPayload(prepareResult.stdout);
    if (!prepare) {
      this.patch(job, 'error', prepareResult.stderr.trim() || `Prepare worker berhenti dengan kode ${prepareResult.exitCode}`);
      return;
    }

    job.windowHandle = Number(prepare.hwnd) || undefined;
    if (prepare.needsLogin) {
      this.patch(job, 'needs_login', prepare.message || 'Akun perlu login Google');
      return;
    }
    if (!prepare.ok || !job.windowHandle) {
      this.patch(job, 'error', prepare.message || 'AI Studio gagal dipersiapkan');
      return;
    }

    this.patch(job, 'prepared', prepare.message || 'Narasi sudah dimasukkan');

    const voiceName = loadSettings().voiceName;
    this.patch(job, 'selecting_voice', `Memilih voice ${voiceName}…`);
    const generateResult = await runProcess('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', this.workerPath('aiStudioGenerate.ps1'),
      '-Hwnd', String(job.windowHandle),
      '-VoiceName', voiceName,
    ], signal).catch(error => ({
      exitCode: -1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    }));

    if (signal.aborted) {
      this.patch(job, 'stopped', 'Dihentikan pengguna');
      return;
    }

    const generated = parseJsonPayload(generateResult.stdout);
    if (!generated) {
      this.patch(job, 'error', generateResult.stderr.trim() || `Generate worker berhenti dengan kode ${generateResult.exitCode}`);
      return;
    }
    if (!generated.ok || !generated.generateClicked) {
      this.patch(job, 'error', generated.message || 'Voice/Generate tidak berhasil dijalankan');
      return;
    }

    this.patch(job, 'generating', generated.message || 'Generate sedang berjalan');
  }

  private patch(job: RuntimeVoiceJob, status: RuntimeVoiceJob['status'], message: string) {
    job.status = status;
    job.message = message;
    job.updatedAt = nowIso();
    this.emit();
  }

  private workerPath(fileName: string) {
    const devPath = path.join(app.getAppPath(), 'automation', fileName);
    if (fs.existsSync(devPath)) return devPath;
    return path.join(process.resourcesPath, 'automation', fileName);
  }

  private emit() {
    const payload = this.getSnapshot();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('voice-agent:runtime-update', payload);
    }
  }
}
