import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bot, CircleUserRound, CloudCog, Download, Gauge, KeyRound, Layers3,
  Play, RefreshCw, Save, Settings2, ShieldCheck, Sparkles, Square,
  Trash2, UserRoundPlus, Waves
} from 'lucide-react';
import { planJobs } from '../shared/pairing';
import { MAX_GEMINI_API_KEYS, MAX_GOOGLE_PROFILES } from '../shared/constants';

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

const demoJobs = planJobs(Array.from({length: 15}, (_,i) => i + 1));

function Pill({children, tone='default'}:{children:ReactNode;tone?:string}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function voLabel(slot:number) {
  return `VO${String(slot).padStart(2, '0')}`;
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
  const [downloadState,setDownloadState] = useState<DownloadState>({
    open:false, localTime:'--:--', label:'04:30–05:05 Asia/Jakarta', nextLabel:'Menunggu runtime'
  });

  const visibleJobs = useMemo(() => demoJobs.slice(0,12), []);
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.slot,p])), [profiles]);

  useEffect(() => {
    const refresh = async () => {
      if (!window.voiceAgent) return;
      try {
        setProfiles(await window.voiceAgent.listProfiles());
        setDownloadState(await window.voiceAgent.getDownloadWindow());
      } catch {}
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
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

  const configuredCount = profiles.length;

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
          <div><span>Browser concurrency</span><b>6 / 50</b></div>
          <div className="meter"><i style={{width:'12%'}}/></div>
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
        <div className="actions">
          <button className="btn ghost"><RefreshCw size={16}/>Scan</button>
          <button className="btn primary"><Play size={16}/>Mulai Semua</button>
          <button className="btn danger"><Square size={14}/>Stop</button>
        </div>
      </section>

      {tab==='jobs' && <>
        <section className="stats-grid">
          <div className="stat"><Gauge/><div><span>Parts</span><b>15</b><small>30 voice jobs</small></div></div>
          <div className="stat"><CircleUserRound/><div><span>Accounts</span><b>{configuredCount}/50</b><small>25 pasangan maksimum</small></div></div>
          <div className="stat"><Download/><div><span>Download</span><b>{downloadState.open ? 'OPEN' : 'LOCKED'}</b><small>{downloadState.nextLabel}</small></div></div>
          <div className="stat"><Sparkles/><div><span>AI mode</span><b>Local first</b><small>Gemini saat perlu</small></div></div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><b>Part → Account pairing</b><span>Urutan otomatis, tepat 2 akun untuk setiap Part</span></div><Pill tone="good">3 Part / 6 browser concurrent</Pill></div>
          <div className="table">
            <div className="tr th"><span>PART</span><span>ACCOUNT A</span><span>ACCOUNT B</span><span>STATUS</span><span>DOWNLOAD</span></div>
            {visibleJobs.map((j,idx)=><div className="tr" key={j.partNumber}>
              <span className="part">Part {String(j.partNumber).padStart(2,'0')}</span>
              <span><Pill tone={profileMap.has(j.accountA)?'good':'default'}>{voLabel(j.accountA)}</Pill></span>
              <span><Pill tone={profileMap.has(j.accountB)?'good':'default'}>{voLabel(j.accountB)}</Pill></span>
              <span className={idx<3?'status-good':'muted'}>{idx<3?'Next batch':'Waiting'}</span>
              <span className="muted">Queued</span>
            </div>)}
          </div>
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
        <div className="agent-card"><Sparkles size={17}/><p>Saya akan memprioritaskan kontrol lokal. Gemini dipakai saat perlu menganalisis error atau perintah kompleks.</p></div>
        <div className="agent-msg"><span>System</span><p>Aturan aktif: 1 Part = 2 akun. Download hanya 04:30–05:05 WIB.</p></div>
        <div className="agent-msg"><span>Agent</span><p>{configuredCount} dari 50 slot akun sudah dikonfigurasi. Default executor: 3 Part / 6 browser sekaligus.</p></div>
      </div>
      <div className="agent-input"><textarea value={agentText} onChange={e=>setAgentText(e.target.value)} placeholder="Contoh: lanjutkan semua yang belum selesai..."/><button><Sparkles size={17}/></button><small>Agent actions akan dicatat di activity log.</small></div>
    </aside>
  </div>;
}
