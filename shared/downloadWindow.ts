import { DOWNLOAD_TIMEZONE, DOWNLOAD_WINDOW_END, DOWNLOAD_WINDOW_START } from './constants.js';
import type { DownloadWindowState } from './types.js';

function minutesOf(value: string) {
  const [h,m] = value.split(':').map(Number);
  return h * 60 + m;
}

function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return {
    hour: Number(get('hour')), minute: Number(get('minute')),
    weekday: get('weekday'), day: get('day'), month: get('month'), year: get('year')
  };
}

export function getDownloadWindowState(now = new Date(), timeZone = DOWNLOAD_TIMEZONE): DownloadWindowState {
  const p = zonedParts(now, timeZone);
  const current = p.hour * 60 + p.minute;
  const start = minutesOf(DOWNLOAD_WINDOW_START);
  const end = minutesOf(DOWNLOAD_WINDOW_END);

  // End is exclusive: 04:30:00 <= local time < 05:05:00.
  const open = current >= start && current < end;
  const localTime = `${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;
  const nextLabel = current < start
    ? `Hari ini ${DOWNLOAD_WINDOW_START}`
    : current < end
      ? `Sekarang sampai ${DOWNLOAD_WINDOW_END}`
      : `Besok ${DOWNLOAD_WINDOW_START}`;

  return {
    open, localTime, nextLabel,
    label: `${DOWNLOAD_WINDOW_START}–${DOWNLOAD_WINDOW_END} ${timeZone}`
  };
}
