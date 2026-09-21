import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { loadProfiles } from './profileRegistry.js';
import { loadSettings } from './settingsStore.js';
import { runProcess } from './processUtils.js';
import { scanPartFolder } from './inputScanner.js';
import { getDownloadWindowState } from '../shared/downloadWindow.js';
import { MAX_GOOGLE_PROFILES } from '../shared/constants.js';
import type { RuntimeSnapshot, RuntimeVoiceJob } from '../shared/runtimeTypes.js';

const TARGET_URL = 'https://aistudio.google.com/generate-speech?model=gemini-2.5-pro-preview-tts';
const BATCH_SIZE = 6;
const GENERATION_TIMEOUT_MS = 30 * 60 * 1000;
const INSPECT_INTERVAL_MS = 5000;

function nowIso() { return new Date().toISOString(); }

function parseJsonPayload(stdout: string) {
  const lines = stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  });
}

export class JobController {
  private snapshot: RuntimeSnapshot = {
    running: false,
    inputFolder: null,
    startedAt: null,
    jobs: [],
  };
  private aborter: AbortController | null = null;
  private downloadBusy = false;

  initialize() {
    if (!app.isReady()) return;
    const file = this.runtimePath();
    if (!fs.existsSync(file)) return;

    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as RuntimeSnapshot;
      if (!saved || !Array.isArray(saved.jobs)) return;

      saved.running = false;
      for (const job of saved.jobs) {
        if (job.status === 'downloading') {
          job.status = 'generated';
          job.message = 'Antrean download dipulihkan setelah aplikasi dibuka kembali.';
          job.updatedAt = nowIso();
        } else if (['opening','filling','prepared','selecting_voice','generating'].includes(job.status)) {
          job.status = 'error';
          job.message = 'Proses terputus saat aplikasi sebelumnya ditutup. Jalankan ulang proyek untuk job ini.';
          job.updatedAt = nowIso();
        }
      }

      this.snapshot = saved;
      this.persist();
    } catch {
      // Corrupt runtime state must never prevent the desktop app from opening.
    }
  }

  getSnapshot(): RuntimeSnapshot {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  scan(inputFolder: string) {
    const parts = scanPartFolder(inputFolder);
    if (parts.length > MAX_GOOGLE_PROFILES / 2) {
      throw new Error(`Satu siklus maksimal ${MAX_GOOGLE_PROFILES / 2} Part karena setiap Part membutuhkan 2 akun unik.`);
    }

    const profiles = new Map(loadProfiles().filter(p => p.enabled).map(p => [p.slot, p]));
    const jobs: RuntimeVoiceJob[] = [];

    parts.forEach((part, index) => {
      const accountA = index * 2 + 1;
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

    this.snapshot.running = true;
    this.snapshot.startedAt = nowIso();
    this.aborter = new AbortController();
    this.emit();

    try {
      for (let offset = 0; offset < this.snapshot.jobs.length; offset += BATCH_SIZE) {
        if (this.aborter.signal.aborted) break;
        const batch = this.snapshot.jobs.slice(offset, offset + BATCH_SIZE);

        for (const job of this.snapshot.jobs.slice(offset + BATCH_SIZE)) {
          if (job.status === 'waiting') {
            job.message = `Menunggu batch ${Math.floor(offset / BATCH_SIZE) + 2}`;
            job.updatedAt = nowIso();
          }
        }
        this.emit();

        // Launch sequentially so new Chrome HWND detection cannot race.
        // After Generate is clicked, windows in this batch work in parallel.
        for (let i = 0; i < batch.length; i++) {
          if (this.aborter.signal.aborted) break;
          await this.prepareAndGenerateOne(batch[i], i + 1, this.aborter.signal);
        }

        if (this.aborter.signal.aborted) break;
        await this.waitForBatch(batch, this.aborter.signal);
      }
    } finally {
      this.snapshot.running = false;
      this.aborter = null;
      this.emit();

      // If generation happens to finish inside the allowed download window,
      // start draining the queue immediately.
      void this.tickDownloadScheduler();
    }
    return this.getSnapshot();
  }

  stop() {
    this.aborter?.abort();
    for (const job of this.snapshot.jobs) {
      if (['waiting','opening','filling','prepared','selecting_voice'].includes(job.status)) {
        job.status = 'stopped';
        job.message = 'Dihentikan pengguna';
        job.updatedAt = nowIso();
      }
    }
    this.snapshot.running = false;
    this.emit();
    return this.getSnapshot();
  }

  async tickDownloadScheduler() {
    if (this.downloadBusy || this.snapshot.running) return this.getSnapshot();

    const windowState = getDownloadWindowState();
    if (!windowState.open) return this.getSnapshot();

    const candidates = this.snapshot.jobs.filter(j => j.status === 'generated');
    if (!candidates.length) return this.getSnapshot();

    this.downloadBusy = true;
    try {
      for (const job of candidates) {
        // Authoritative guard: no new download may start at or after 05:05.
        if (!getDownloadWindowState().open) break;

        if (!job.windowHandle) {
          this.patch(job, 'download_error', 'Window hasil Generate tidak tersedia untuk download.');
          continue;
        }
        if (!this.snapshot.inputFolder) {
          this.patch(job, 'download_error', 'Folder proyek tidak tersedia.');
          continue;
        }

        const outputDir = path.join(this.snapshot.inputFolder, 'VOICE OUTPUT');
        const outputBase = path.join(
          outputDir,
          `Part${String(job.partNumber).padStart(2,'0')}-VO${String(job.accountSlot).padStart(2,'0')}`
        );

        this.patch(job, 'downloading', 'Jendela download aktif. Mengunduh audio…');
        const result = await runProcess('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass',
          '-File', this.workerPath('aiStudioDownload.ps1'),
          '-Hwnd', String(job.windowHandle),
          '-OutputBase', outputBase,
        ]).catch(error => ({
          exitCode: -1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
        }));

        const payload = parseJsonPayload(result.stdout);
        if (payload?.ok) {
          job.outputPath = String(payload.outputPath || '');
          this.patch(job, 'downloaded', payload.message || 'Download selesai.');
          continue;
        }

        const message = String(payload?.message || result.stderr.trim() || 'Download gagal.');
        if (message.includes('DOWNLOAD_LOCKED')) {
          // The exact time boundary may have been crossed after this tick started.
          // Keep it queued for tomorrow instead of marking it as a failure.
          this.patch(job, 'generated', 'Jendela 05:05 sudah ditutup. Menunggu 04:30 berikutnya.');
          break;
        }

        this.patch(job, 'download_error', message);
      }
    } finally {
      this.downloadBusy = false;
    }

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

  private async waitForBatch(batch: RuntimeVoiceJob[], signal: AbortSignal) {
    const deadline = Date.now() + GENERATION_TIMEOUT_MS;

    while (!signal.aborted) {
      const generating = batch.filter(j => j.status === 'generating');
      if (!generating.length) return;

      if (Date.now() > deadline) {
        for (const job of generating) {
          this.patch(job, 'error', 'Timeout menunggu hasil Generate (30 menit).');
        }
        return;
      }

      for (const job of generating) {
        if (signal.aborted) return;
        if (!job.windowHandle) {
          this.patch(job, 'error', 'Window handle hilang saat memantau Generate.');
          continue;
        }

        const inspected = await runProcess('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass',
          '-File', this.workerPath('aiStudioInspect.ps1'),
          '-Hwnd', String(job.windowHandle),
          '-MinimizeWhenReady',
        ], signal).catch(error => ({
          exitCode: -1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
        }));

        if (signal.aborted) return;
        const payload = parseJsonPayload(inspected.stdout);
        if (!payload?.ok) {
          this.patch(job, 'error', payload?.message || inspected.stderr.trim() || 'Gagal membaca status Generate.');
          continue;
        }

        switch (payload.state) {
          case 'generated':
            this.patch(job, 'generated', payload.message || 'Audio siap dan masuk antrean download.');
            break;
          case 'provider_limited':
            this.patch(job, 'provider_limited', payload.message || 'Akun terkena limit provider.');
            break;
          case 'needs_login':
            this.patch(job, 'needs_login', payload.message || 'Sesi Google meminta login.');
            break;
          case 'error':
          case 'window_closed':
            this.patch(job, 'error', payload.message || 'Generate gagal.');
            break;
          default:
            if (job.message !== payload.message) {
              this.patch(job, 'generating', payload.message || 'Generate masih berjalan.');
            }
            break;
        }
      }

      if (batch.every(j => ['generated','provider_limited','needs_login','error','stopped'].includes(j.status))) {
        return;
      }

      try {
        await delay(INSPECT_INTERVAL_MS, signal);
      } catch {
        return;
      }
    }
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

  private runtimePath() {
    return path.join(app.getPath('userData'), 'runtime.json');
  }

  private persist() {
    if (!app.isReady()) return;
    try {
      const file = this.runtimePath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(this.snapshot, null, 2), 'utf8');
    } catch {
      // Runtime persistence is protective; workflow execution should continue if disk write fails.
    }
  }

  private emit() {
    this.persist();
    const payload = this.getSnapshot();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('voice-agent:runtime-update', payload);
    }
  }
}
