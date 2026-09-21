import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Bot, CheckCircle2, CircleUserRound, CloudCog, Download,
  FolderOpen, Gauge, KeyRound, Layers3, LoaderCircle, Play, RefreshCw,
  Save, Settings2, ShieldCheck, Sparkles, Square, Trash2, UserRoundPlus, Waves
} from 'lucide-react';
import { MAX_GEMINI_API_KEYS, MAX_GOOGLE_PROFILES } from '../shared/constants';
import { DEFAULT_GEMINI_TTS_VOICE, GEMINI_TTS_VOICES } from '../shared/voices';

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

type DownloadState = {
  open: boolean;
  localTime: string;
  label: string;
  nextLabel: string;
};

type RuntimeVoiceJob = {
  id: string;
  partNumber: number;
  accountSlot: number;
  pairSide: 'A' | 'B';
  sourcePath: string;
  sourceName: string;
  status: 'waiting' | 'opening' | 'needs_login' | 'filling' | 'prepared' | 'selecting_voice' | 'generating' | 'generated' | 'downloading' | 'downloaded' | 'download_error' | 'provider_limited' | 'error' | 'stopped';
  message: string;
  windowHandle?: number;
  outputPath?: string;
  updatedAt: string;
};

type RuntimeSnapshot = {
  running: boolean;
  inputFolder: string | null;
  startedAt: string | null;
  jobs: RuntimeVoiceJob[];
};

const EMPTY_RUNTIME:RuntimeSnapshot = {
  running:false,
  inputFolder:null,
  startedAt:null,
  jobs:[],
};

function Pill({children, tone='default'}:{children:ReactNode;tone?:string}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function voLabel(slot:number) {
  return `VO${String(slot).padStart(2, '0')}`;
}

function statusTone(status?:RuntimeVoiceJob['status']) {
  if (status === 'prepared' || status === 'generated' || status === 'downloaded') return 'good';
  if (status === 'opening' || status === 'filling' || status === 'selecting_voice' || status === 'generating' || status === 'downloading') return 'busy';
  if (status === 'needs_login' || status === 'provider_limited') return 'warn';
  if (status === 'error' || status === 'stopped' || status === 'download_error') return 'bad';
  return 'default';
}

function shortStatus(job?:RuntimeVoiceJob) {
  if (!job) return '—';
  const labels:Record<RuntimeVoiceJob['status'],string> = {
    waiting:'Waiting',
    opening:'Opening',
    needs_login:'Need login',
    filling:'Filling',
    prepared:'Prepared',
    selecting_voice:'Voice',
    generating:'Generating',
    generated:'Queued',
    downloading:'Downloading',
    downloaded:'Downloaded',
    download_error:'Download error',
    provider_limited:'Limited',
    error:'Error',
    stopped:'Stopped',
  };
  return labels[job.status];
}

export default function App(){
  const [tab,setTab] = useState<'jobs'|'accounts'|'api'>('jobs');
  const [agentText,setAgentText] = useState('');
  const [profiles,setProfiles] = useState<StoredProfile[]>([]);
  const [chromeProfiles,setChromeProfiles] = useState<ChromeProfileCandidate[]>([]);
  const [editingSlot,setEditingSlot] = useState(1);
  const [editingLabel,setEditingLabel] = useState(voLabel(1));
  const [editingChrome,setEditingChrome] = useState('');
  const [accountMessage,setAccountMessage] = useState('');
  const [workflowMessage,setWorkflowMessage] = useState('');
  const [runtime,setRuntime] = useState<RuntimeSnapshot>(EMPTY_RUNTIME);
  const [inputFolder,setInputFolder] = useState('');
  const [voiceName,setVoiceName] = useState<string>(DEFAULT_GEMINI_TTS_VOICE);
  const [downloadState,setDownloadState] = useState<DownloadState>({
    open:false, localTime:'--:--', label:'04:30–05:05 Asia/Jakarta', nextLabel:'Menunggu runtime'
  });

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.slot,p])), [profiles]);
  const groupedJobs = useMemo(() => {
    const map = new Map<number,{partNumber:number;a?:RuntimeVoiceJob;b?:RuntimeVoiceJob;sourceName:string}>();
    for (const job of runtime.jobs) {
      const row = map.get(job.partNumber) || {partNumber:job.partNumber,sourceName:job.sourceName};
      if (job.pairSide === 'A') row.a = job;
      else row.b = job;
      map.set(job.partNumber,row);
    }
    return [...map.values()].sort((a,b)=>a.partNumber-b.partNumber);
  }, [runtime.jobs]);

  useEffect(() => {
    const refresh = async () => {
      if (!window.voiceAgent) return;
      try {
        setProfiles(await window.voiceAgent.listProfiles());
        setDownloadState(await window.voiceAgent.getDownloadWindow());
        const settings = await window.voiceAgent.getSettings();
        setVoiceName(settings.voiceName || DEFAULT_GEMINI_TTS_VOICE);
        const snap = await window.voiceAgent.getWorkflow();
        setRuntime(snap);
        if (snap.inputFolder) setInputFolder(snap.inputFolder);
        window.voiceAgent.onRuntimeUpdate(next => setRuntime(next));
      } catch {}
    };
    refresh();
    const timer = window.setInterval(async () => {
      if (!window.voiceAgent) return;
      try { setDownloadState(await window.voiceAgent.getDownloadWindow()); } catch {}
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  async function scanChromeProfiles() {
    if (!window.voiceAgent) {
      setAccountMessage('Scan Chrome tersedia saat aplikasi dijalankan sebagai desktop app.');
      return;
    }
    try {
      const found = await window.voiceAgent.discoverChromeProfiles();
      setChromeProfiles(found);
      setAccountMessage(`${found.length} Chrome profile ditemukan.`);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Gagal membaca Chrome profile.');
    }
  }

  function editSlot(slot:number) {
    setEditingSlot(slot);
    const existing = profileMap.get(slot);
    setEditingLabel(existing?.label || voLabel(slot));
    setEditingChrome(existing?.chromeProfileName || '');
    setAccountMessage('');
  }

  async function saveAccount() {
    const payload:StoredProfile = {
      slot:editingSlot,
      label:editingLabel.trim() || voLabel(editingSlot),
      chromeProfileName:editingChrome,
      enabled:true,
    };
    if (!payload.chromeProfileName) {
      setAccountMessage('Pilih Chrome profile terlebih dahulu.');
      return;
    }
    if (!window.voiceAgent) {
      setProfiles(prev => [...prev.filter(p => p.slot !== editingSlot), payload].sort((a,b)=>a.slot-b.slot));
      setAccountMessage('Preview tersimpan sementara. Jalankan desktop app untuk penyimpanan permanen.');
      return;
    }
    try {
      setProfiles(await window.voiceAgent.saveProfile(payload));
      setAccountMessage(`${voLabel(editingSlot)} tersimpan.`);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Gagal menyimpan akun.');
    }
  }

  async function removeAccount() {
    if (!profileMap.has(editingSlot)) return;
    if (!window.voiceAgent) {
      setProfiles(prev => prev.filter(p => p.slot !== editingSlot));
      setEditingChrome('');
      setAccountMessage(`${voLabel(editingSlot)} dihapus dari preview.`);
      return;
    }
    try {
      setProfiles(await window.voiceAgent.removeProfile(editingSlot));
      setEditingChrome('');
      setAccountMessage(`${voLabel(editingSlot)} dilepas dari registry.`);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : 'Gagal menghapus akun.');
    }
  }

  async function chooseInputFolder() {
    if (!window.voiceAgent) return;
    const folder = await window.voiceAgent.chooseInputFolder();
    if (!folder) return;
    setInputFolder(folder);
    setWorkflowMessage('');
    try {
      setRuntime(await window.voiceAgent.scanInput(folder));
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : 'Scan input gagal.');
    }
  }

  async function scanInput() {
    if (!window.voiceAgent) return;
    if (!inputFolder) {
      await chooseInputFolder();
      return;
    }
    try {
      setWorkflowMessage('');
      setRuntime(await window.voiceAgent.scanInput(inputFolder));
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : 'Scan input gagal.');
    }
  }

  async function changeVoice(nextVoice:string) {
    setVoiceName(nextVoice);
    if (!window.voiceAgent) return;
    try {
      const saved = await window.voiceAgent.saveSettings({voiceName:nextVoice});
      setVoiceName(saved.voiceName);
      setWorkflowMessage(`Voice diatur ke ${saved.voiceName}.`);
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : 'Gagal menyimpan voice.');
    }
  }

  async function startWorkflow() {
    if (!window.voiceAgent) return;
    if (!inputFolder) {
      setWorkflowMessage('Pilih folder INPUT PART terlebih dahulu.');
      return;
    }
    try {
      setWorkflowMessage('Menjalankan batch pertama: 3 Part / 6 akun…');
      const finalState = await window.voiceAgent.startWorkflow(inputFolder);
      setRuntime(finalState);
      setWorkflowMessage('Generate otomatis selesai dipantau untuk semua batch yang dapat diproses. Audio siap tetap tersimpan untuk antrean download.');
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : 'Workflow gagal dijalankan.');
    }
  }

  async function stopWorkflow() {
    if (!window.voiceAgent) return;
    try {
      setRuntime(await window.voiceAgent.stopWorkflow());
      setWorkflowMessage('Workflow dihentikan.');
    } catch (error) {
      setWorkflowMessage(error instanceof Error ? error.message : 'Gagal menghentikan workflow.');
    }
  }

  const configuredCount = profiles.length;
  const generatingCount = runtime.jobs.filter(j=>j.status==='generating').length;
  const generatedCount = runtime.jobs.filter(j=>j.status==='generated').length;
  const downloadingCount = runtime.jobs.filter(j=>j.status==='downloading').length;
  const downloadedCount = runtime.jobs.filter(j=>j.status==='downloaded').length;
  const activeCount = runtime.jobs.filter(j=>['opening','filling','selecting_voice','generating','downloading'].includes(j.status)).length;
  const issueCount = runtime.jobs.filter(j=>['error','needs_login','provider_limited','download_error'].includes(j.status)).length;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Waves size={18}/></div><div><b>Edit Aja</b><span>Voice Agent</span></div></div>
      <div className="top-status">
        <Pill tone={downloadState.open ? 'good' : 'locked'}>
          <ShieldCheck size={13}/> {downloadState.open ? 'Download OPEN' : 'Download LOCKED'}
        </Pill>
        <Pill>{downloadState.localTime} WIB</Pill>
      </div>
    </header>

    <aside className="sidebar">
      <div className="side-section-label">WORKSPACE</div>
      <button className={tab==='jobs'?'nav active':'nav'} onClick={()=>setTab('jobs')}><Layers3/>Jobs</button>
      <button className={tab==='accounts'?'nav active':'nav'} onClick={()=>setTab('accounts')}><CircleUserRound/>50 Accounts</button>
      <button className={tab==='api'?'nav active':'nav'} onClick={()=>setTab('api')}><KeyRound/>100 API Pool</button>
      <div className="side-section-label">SYSTEM</div>
      <button className="nav"><CloudCog/>Automation</button>
      <button className="nav"><Settings2/>Settings</button>
      <div className="sidebar-bottom">
        <div className="mini-meter">
          <div><span>Browser concurrency</span><b>{activeCount} / 6</b></div>
          <div className="meter"><i style={{width:`${Math.min(100,(activeCount/6)*100)}%`}}/></div>
        </div>
      </div>
    </aside>

    <main className="workspace">
      <section className="hero-row">
        <div>
          <p className="eyebrow">VOICE PRODUCTION CONTROL CENTER</p>
          <h1>{tab==='jobs'?'Production queue':tab==='accounts'?'Google AI Studio accounts':'Gemini API emergency pool'}</h1>
          <p className="muted">Setiap Part dibuat oleh 2 akun berbeda. Generate boleh jalan kapan saja, download dikunci ke 04:30–05:05 WIB.</p>
        </div>
        {tab==='jobs' && <div className="actions">
          <button className="btn ghost" onClick={scanInput} disabled={runtime.running}><RefreshCw size={16}/>Scan</button>
          <button className="btn primary" onClick={startWorkflow} disabled={runtime.running}><Play size={16}/>{runtime.running?'Running…':'Mulai'}</button>
          <button className="btn danger" onClick={stopWorkflow} disabled={!runtime.running}><Square size={14}/>Stop</button>
        </div>}
      </section>

      {tab==='jobs' && <>
        <section className="project-bar">
          <button className="btn ghost" onClick={chooseInputFolder} disabled={runtime.running}><FolderOpen size={16}/>Pilih Folder</button>
          <div className="project-path">
            <span>INPUT PART</span>
            <b>{inputFolder || 'Belum memilih folder'}</b>
          </div>
          <label className="voice-picker"><span>VOICE</span><select value={voiceName} onChange={e=>changeVoice(e.target.value)} disabled={runtime.running}>{GEMINI_TTS_VOICES.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
          <Pill tone={runtime.running?'busy':'default'}>{runtime.running?'Workflow running':'Ready'}</Pill>
        </section>

        {workflowMessage && <div className={issueCount ? 'runtime-msg warn-msg' : 'runtime-msg'}>{workflowMessage}</div>}

        <section className="stats-grid">
          <div className="stat"><Gauge/><div><span>Parts</span><b>{groupedJobs.length}</b><small>{runtime.jobs.length} voice jobs</small></div></div>
          <div className="stat"><CircleUserRound/><div><span>Accounts</span><b>{configuredCount}/50</b><small>25 pasangan maksimum</small></div></div>
          <div className="stat"><CheckCircle2/><div><span>Generated Queue</span><b>{generatedCount}</b><small>{generatingCount} masih generating</small></div></div>
          <div className="stat"><Download/><div><span>Downloaded</span><b>{downloadedCount}</b><small>{downloadingCount ? `${downloadingCount} downloading` : downloadState.nextLabel}</small></div></div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><b>Part → Account pairing</b><span>Otomatis 3 Part / 6 window per batch; batch berikutnya mulai setelah audio siap</span></div>
            <div className="head-actions">
              {issueCount > 0 && <Pill tone="bad"><AlertTriangle size={12}/>{issueCount} issue</Pill>}
              <Pill tone="good">1 Part = 2 akun</Pill>
            </div>
          </div>

          {groupedJobs.length === 0 ? <div className="empty-state">
            <FolderOpen size={28}/>
            <b>Pilih folder INPUT PART</b>
            <span>Aplikasi akan membaca Part1, Part2, Part3… dari TXT, MD, atau DOCX.</span>
          </div> :
          <div className="table">
            <div className="tr th"><span>PART</span><span>ACCOUNT A</span><span>ACCOUNT B</span><span>STATUS</span><span>SOURCE</span></div>
            {groupedJobs.map(row=><div className="tr" key={row.partNumber}>
              <span className="part">Part {String(row.partNumber).padStart(2,'0')}</span>
              <span><Pill tone={statusTone(row.a)}>{(['opening','selecting_voice','downloading'].includes(row.a?.status || ''))&&<LoaderCircle size={11}/>}  {row.a?voLabel(row.a.accountSlot):'—'} · {shortStatus(row.a)}</Pill></span>
              <span><Pill tone={statusTone(row.b)}>{(['opening','selecting_voice','downloading'].includes(row.b?.status || ''))&&<LoaderCircle size={11}/>}  {row.b?voLabel(row.b.accountSlot):'—'} · {shortStatus(row.b)}</Pill></span>
              <span className="job-detail">{row.a?.message || row.b?.message || 'Menunggu'}</span>
              <span className="source-name" title={row.sourceName}>{row.sourceName}</span>
            </div>)}
          </div>}
        </section>
      </>}

      {tab==='accounts' && <section className="panel">
        <div className="panel-head">
          <div><b>Google profile registry</b><span>Masukkan sampai 50 akun melalui Chrome profile yang sudah login ke Google AI Studio.</span></div>
          <div className="head-actions"><Pill tone="good">{configuredCount}/50 configured</Pill><button className="mini-btn" onClick={scanChromeProfiles}><RefreshCw size={13}/>Scan Chrome</button></div>
        </div>

        <div className="account-editor">
          <div className="editor-title"><UserRoundPlus size={17}/><div><b>Account slot {voLabel(editingSlot)}</b><span>Password Google tidak disimpan.</span></div></div>
          <div className="form-row">
            <label><span>Slot</span><select value={editingSlot} onChange={e=>editSlot(Number(e.target.value))}>
              {Array.from({length:MAX_GOOGLE_PROFILES},(_,i)=><option key={i+1} value={i+1}>{voLabel(i+1)} · Pair {Math.floor(i/2)+1}</option>)}
            </select></label>
            <label><span>Label</span><input value={editingLabel} onChange={e=>setEditingLabel(e.target.value)} placeholder={voLabel(editingSlot)}/></label>
            <label className="wide"><span>Chrome profile</span><select value={editingChrome} onChange={e=>setEditingChrome(e.target.value)}>
              <option value="">Pilih Chrome profile...</option>
              {editingChrome && !chromeProfiles.some(p=>p.directory===editingChrome) && <option value={editingChrome}>{editingChrome}</option>}
              {chromeProfiles.map(p=><option key={p.directory} value={p.directory}>{p.name} · {p.directory}</option>)}
            </select></label>
            <button className="btn primary" onClick={saveAccount}><Save size={15}/>Simpan</button>
            <button className="btn danger" onClick={removeAccount} disabled={!profileMap.has(editingSlot)}><Trash2 size={15}/></button>
          </div>
          <div className="account-note">{accountMessage || 'Klik “Scan Chrome”, lalu pilih profil Google yang sudah login AI Studio.'}</div>
        </div>

        <div className="account-grid">
          {Array.from({length:MAX_GOOGLE_PROFILES},(_,i)=>{
            const slot=i+1;
            const profile=profileMap.get(slot);
            return <button className={`account-card ${profile?'configured':''} ${editingSlot===slot?'selected':''}`} key={slot} onClick={()=>editSlot(slot)}>
              <div className="avatar">{String(slot).padStart(2,'0')}</div>
              <div><b>{profile?.label || voLabel(slot)}</b><span>{profile?.chromeProfileName || `Pair ${Math.floor(i/2)+1} · empty`}</span></div>
              <i className={profile?'dot ready':'dot'}/>
            </button>;
          })}
        </div>
      </section>}

      {tab==='api' && <section className="panel">
        <div className="panel-head"><div><b>Gemini API Pool</b><span>100 slot API untuk AI Agent. Kunci asli akan disimpan lokal dan terenkripsi, bukan di GitHub.</span></div><Pill>{MAX_GEMINI_API_KEYS} slots</Pill></div>
        <div className="api-summary">
          <div className="big-ring"><b>0</b><span>/ 100</span></div>
          <div><h3>API vault tahap berikutnya</h3><p>Agent tetap mengutamakan otomasi lokal. Gemini dipakai untuk analisis error dan perintah kompleks saat diperlukan.</p><button className="btn primary"><KeyRound size={16}/>Kelola API Keys</button></div>
        </div>
      </section>}
    </main>

    <aside className="agent">
      <div className="agent-head"><div className="agent-icon"><Bot/></div><div><b>AI Agent</b><span><i className="dot ready"/>Siap mengontrol workflow</span></div></div>
      <div className="agent-feed">
        <div className="agent-card"><Sparkles size={17}/><p>Browser Controller V14-compatible sudah tersambung. Agent akan memakai kontrol lokal lebih dulu.</p></div>
        <div className="agent-msg"><span>System</span><p>1 Part = 2 akun. Download hanya 04:30–05:05 WIB.</p></div>
        <div className="agent-msg"><span>Runtime</span><p>{runtime.running ? `Menjalankan/memantau batch dengan voice ${voiceName}.` : `${generatedCount} antre download, ${downloadedCount} sudah tersimpan, ${issueCount} issue.`}</p></div>
        <div className="agent-msg"><span>Download rule</span><p>Scheduler otomatis mengecek antrean setiap 15 detik dan hanya boleh memulai download pada 04:30–sebelum 05:05 WIB.</p></div>
      </div>
      <div className="agent-input"><textarea value={agentText} onChange={e=>setAgentText(e.target.value)} placeholder="Contoh: lanjutkan semua yang belum selesai..."/><button><Sparkles size={17}/></button><small>Chat Agent belum dieksekusi; tool layer sedang dibangun bertahap.</small></div>
    </aside>
  </div>;
}
