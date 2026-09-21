import fs from 'node:fs';
import path from 'node:path';

export interface PartFile {
  partNumber: number;
  name: string;
  fullPath: string;
  extension: '.txt' | '.md' | '.docx';
}

export function partNumberFromName(name: string): number {
  const base = path.basename(name, path.extname(name));
  let match = base.match(/(?:^|[^a-z0-9])part\s*[-_ ]?\s*0*([1-9][0-9]{0,2})(?:[^0-9]|$)/i);
  if (match) return Number(match[1]);
  match = base.match(/^p\s*0*([1-9][0-9]{0,2})(?:[^0-9]|$)/i);
  return match ? Number(match[1]) : 0;
}

function walk(root: string, out: string[]) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

export function scanPartFolder(root: string): PartFile[] {
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('Folder input Part tidak valid.');
  }
  const all: string[] = [];
  walk(root, all);
  const map = new Map<number, PartFile>();
  for (const fullPath of all) {
    const ext = path.extname(fullPath).toLowerCase();
    if (!['.txt', '.md', '.docx'].includes(ext)) continue;
    const partNumber = partNumberFromName(path.basename(fullPath));
    if (!partNumber) continue;
    if (map.has(partNumber)) {
      throw new Error(`Ada lebih dari satu file untuk Part ${partNumber}: ${map.get(partNumber)!.name} dan ${path.basename(fullPath)}`);
    }
    map.set(partNumber, {
      partNumber,
      name: path.basename(fullPath),
      fullPath,
      extension: ext as PartFile['extension'],
    });
  }
  return [...map.values()].sort((a,b) => a.partNumber - b.partNumber);
}
