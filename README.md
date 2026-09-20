# Edit Aja Voice Agent

Aplikasi Windows modern untuk mengelola workflow pembuatan voice di Google AI Studio dengan AI Agent, multi Chrome profile, job queue, dan download scheduler.

## Aturan inti

- Maksimum **50 Google/Chrome profiles**.
- **1 Part = 2 akun berbeda**. 50 akun berarti 25 pasangan sebelum assignment berputar kembali.
- Default concurrency: **3 Part / 6 browser** agar laptop tidak membuka 50 browser sekaligus.
- Generate dapat berjalan di luar jam download.
- Download hanya diizinkan **04:30–05:05 Asia/Jakarta**.
- Maksimum **100 slot Gemini API** untuk AI Agent. API adalah fallback; otomasi deterministik lokal tetap diprioritaskan.
- Password Google tidak pernah disimpan. Login memakai persistent Chrome profiles.
- API key asli tidak pernah disimpan di repository; production vault akan memakai enkripsi lokal Electron `safeStorage`.

## Status

Fase 1 sudah membuat shell Electron + React + TypeScript, UI modern, pairing engine 50 akun, aturan scheduler download, dan guardrail agent. Integrasi browser AI Studio dan migration dari V14 dilanjutkan bertahap.

## Development

```bash
npm install
npm run dev
```

Build Windows:

```bash
npm run dist
```
