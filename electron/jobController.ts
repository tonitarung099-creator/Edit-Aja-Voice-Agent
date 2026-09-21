import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { loadProfiles } from './profileRegistry.js';
import { runProcess } from './processUtils.js';
import { scanPartFolder } from './inputScanner.js';
import { MAX_GOOGLE_PROFILES } from '../shared/constants.js';
import type { RuntimeSnapshot, RuntimeVoiceJob } from '../shared/runtimeTypes.js';

const TARGET_URL = 'https://aistudio.google.com/generate-speech?model=gemini-2.5-pro-preview-tts';

function nowIso() { return new Date().toISOString(); }

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
          message: configured ? 'Menunggu' : `VO${String(accountSlot).padStart(2,'0')} belum dikonfigurasi`,
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
    const blocked = this.snapshot.jobs.filter(j => j.status === 'error');
    if (blocked.length) {
      throw new Error(`${blocked.length} voice job belum punya Chrome profile. Lengkapi tab 50 Accounts terlebih dahulu.`);
    }

    this.snapshot.running = true;
    this.snapshot.startedAt = nowIso();
    this.aborter = new AbortController();
    this.emit();

    try {
      // Tahap V14-compatible sengaja berurutan saat membuka window agar deteksi HWND tidak saling berebut.
      for (let i = 0; i < this.snapshot.jobs.length; i++) {
        if (this.aborter.signal.aborted) break;
        await this.prepareOne(this.snapshot.jobs[i], (i % 6) + 1, this.aborter.signal);
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
      if (job.status === 'waiting' || job.status === 'opening' || job.status === 'filling') {
        job.status = 'stopped';
        job.message = 'Dihentikan pengguna';
        job.updatedAt = nowIso();
      }
    }
    this.snapshot.running = false;
    this.emit();
    return this.getSnapshot();
  }

  private async prepareOne(job: RuntimeVoiceJob, layoutSlot: number, signal: AbortSignal) {
    const profile = loadProfiles().find(p => p.slot === job.accountSlot && p.enabled);
    if (!profile) {
      this.patch(job, 'error', 'Chrome profile tidak ditemukan.');
      return;
    }

    this.patch(job, 'opening', `Membuka ${profile.label}…`);
    const worker = this.workerPath();
    const result = await runProcess('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', worker,
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

    const lines = result.stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    let payload: any = null;
    for (const line of lines.reverse()) {
      if (!line.startsWith('{')) continue;
      try { payload = JSON.parse(line); break; } catch {}
    }

    if (!payload) {
      this.patch(job, 'error', result.stderr.trim() || `Worker berhenti dengan kode ${result.exitCode}`);
      return;
    }
    if (payload.needsLogin) {
      this.patch(job, 'needs_login', payload.message || 'Akun perlu login Google');
      return;
    }
    if (!payload.ok) {
      this.patch(job, 'error', payload.message || 'AI Studio gagal dipersiapkan');
      return;
    }
    job.windowHandle = Number(payload.hwnd) || undefined;
    this.patch(job, 'prepared', payload.message || 'Narasi sudah dimasukkan');
  }

  private patch(job: RuntimeVoiceJob, status: RuntimeVoiceJob['status'], message: string) {
    job.status = status;
    job.message = message;
    job.updatedAt = nowIso();
    this.emit();
  }

  private workerPath() {
    // Dev: repo/resources. Packaged: resourcesPath/automation.
    const devPath = path.join(app.getAppPath(), 'automation', 'aiStudioPrepare.ps1');
    if (fs.existsSync(devPath)) return devPath;
    return path.join(process.resourcesPath, 'automation', 'aiStudioPrepare.ps1');
  }

  private emit() {
    const payload = this.getSnapshot();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('voice-agent:runtime-update', payload);
    }
  }
}
