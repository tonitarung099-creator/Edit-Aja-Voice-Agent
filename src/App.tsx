import { useMemo, useState } from 'react';
import { Bot, CircleUserRound, CloudCog, Download, Gauge, KeyRound, Layers3, Play, RefreshCw, Settings2, ShieldCheck, Sparkles, Square, Waves } from 'lucide-react';
import { planJobs } from '../shared/pairing';
import { MAX_GEMINI_API_KEYS, MAX_GOOGLE_PROFILES } from '../shared/constants';

const jobs = planJobs(Array.from({length: 15}, (_,i) => i+1));
const accounts = Array.from({length: MAX_GOOGLE_PROFILES}, (_,i) => ({ id:i+1, label:`VO${String(i+1).padStart(2,'0')}`, status: i < 6 ? 'ready' : 'offline' }));

function Pill({children, tone='default'}:{children:React.ReactNode;tone?:string}) { return <span className={`pill ${tone}`}>{children}</span>; }

export default function App(){
  const [tab,setTab]=useState<'jobs'|'accounts'|'api'>('jobs');
  const [agentText,setAgentText]=useState('');
  const visibleJobs=useMemo(()=>jobs.slice(0,12),[]);
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Waves size={18}/></div><div><b>Edit Aja</b><span>Voice Agent</span></div></div><div className="top-status"><Pill tone="good"><ShieldCheck size={13}/> Download lock aktif</Pill><Pill>04:30–05:05 WIB</Pill></div></header>
    <aside className="sidebar">
      <div className="side-section-label">WORKSPACE</div>
      <button className={tab==='jobs'?'nav active':'nav'} onClick={()=>setTab('jobs')}><Layers3/>Jobs</button>
      <button className={tab==='accounts'?'nav active':'nav'} onClick={()=>setTab('accounts')}><CircleUserRound/>50 Accounts</button>
      <button className={tab==='api'?'nav active':'nav'} onClick={()=>setTab('api')}><KeyRound/>100 API Pool</button>
      <div className="side-section-label">SYSTEM</div><button className="nav"><CloudCog/>Automation</button><button className="nav"><Settings2/>Settings</button>
      <div className="sidebar-bottom"><div className="mini-meter"><div><span>Browser concurrency</span><b>6 / 50</b></div><div className="meter"><i style={{width:'12%'}}/></div></div></div>
    </aside>
    <main className="workspace">
      <section className="hero-row"><div><p className="eyebrow">VOICE PRODUCTION CONTROL CENTER</p><h1>{tab==='jobs'?'Production queue':tab==='accounts'?'Google AI Studio accounts':'Gemini API emergency pool'}</h1><p className="muted">Setiap Part dibuat oleh 2 akun berbeda. Generate boleh jalan kapan saja, download dikunci ke jendela waktu.</p></div><div className="actions"><button className="btn ghost"><RefreshCw size={16}/>Scan</button><button className="btn primary"><Play size={16}/>Mulai Semua</button><button className="btn danger"><Square size={14}/>Stop</button></div></section>
      {tab==='jobs' && <><section className="stats-grid"><div className="stat"><Gauge/><div><span>Parts</span><b>15</b><small>30 voice jobs</small></div></div><div className="stat"><CircleUserRound/><div><span>Accounts</span><b>50</b><small>25 pasangan</small></div></div><div className="stat"><Download/><div><span>Download</span><b>04:30</b><small>tutup 05:05 WIB</small></div></div><div className="stat"><Sparkles/><div><span>AI mode</span><b>Local first</b><small>Gemini saat perlu</small></div></div></section>
      <section className="panel"><div className="panel-head"><div><b>Part → Account pairing</b><span>Urutan otomatis, 2 akun per Part</span></div><Pill tone="good">3 Part / 6 browser concurrent</Pill></div><div className="table"><div className="tr th"><span>PART</span><span>ACCOUNT A</span><span>ACCOUNT B</span><span>STATUS</span><span>DOWNLOAD</span></div>{visibleJobs.map((j,idx)=><div className="tr" key={j.partNumber}><span className="part">Part {String(j.partNumber).padStart(2,'0')}</span><span><Pill tone={idx<3?'good':'default'}>VO{String(j.accountA).padStart(2,'0')}</Pill></span><span><Pill tone={idx<3?'good':'default'}>VO{String(j.accountB).padStart(2,'0')}</Pill></span><span className={idx<3?'status-good':'muted'}>{idx<3?'Ready':'Waiting'}</span><span className="muted">Queued</span></div>)}</div></section></>}
      {tab==='accounts' && <section className="panel"><div className="panel-head"><div><b>Google profile registry</b><span>Password tidak disimpan; aplikasi memakai Chrome profile yang sudah login.</span></div><Pill>{MAX_GOOGLE_PROFILES} slots</Pill></div><div className="account-grid">{accounts.map(a=><div className="account-card" key={a.id}><div className="avatar">{String(a.id).padStart(2,'0')}</div><div><b>{a.label}</b><span>Chrome Profile</span></div><i className={a.status==='ready'?'dot ready':'dot'}/></div>)}</div></section>}
      {tab==='api' && <section className="panel"><div className="panel-head"><div><b>Gemini API Pool</b><span>100 slot API untuk AI Agent. Kunci asli disimpan lokal dan terenkripsi, bukan di GitHub.</span></div><Pill>{MAX_GEMINI_API_KEYS} slots</Pill></div><div className="api-summary"><div className="big-ring"><b>0</b><span>/ 100</span></div><div><h3>Belum ada API key</h3><p>Versi awal menyiapkan registry 100 slot. Agent menggunakan otomasi lokal terlebih dahulu agar API tidak boros.</p><button className="btn primary"><KeyRound size={16}/>Kelola API Keys</button></div></div></section>}
    </main>
    <aside className="agent"><div className="agent-head"><div className="agent-icon"><Bot/></div><div><b>AI Agent</b><span><i className="dot ready"/>Siap mengontrol workflow</span></div></div><div className="agent-feed"><div className="agent-card"><Sparkles size={17}/><p>Saya akan memprioritaskan kontrol lokal. Gemini dipakai saat perlu menganalisis error atau perintah kompleks.</p></div><div className="agent-msg"><span>System</span><p>Aturan aktif: 1 Part = 2 akun. Download hanya 04:30–05:05 WIB.</p></div><div className="agent-msg"><span>Agent</span><p>6 browser dapat dijalankan bersamaan untuk 3 Part. Akun berikutnya tetap antre.</p></div></div><div className="agent-input"><textarea value={agentText} onChange={e=>setAgentText(e.target.value)} placeholder="Contoh: lanjutkan semua yang belum selesai..."/><button><Sparkles size={17}/></button><small>Agent actions akan dicatat di activity log.</small></div></aside>
  </div>
}
