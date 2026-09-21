import { spawn } from 'node:child_process';

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function runProcess(command: string, args: string[], signal?: AbortSignal): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', code => resolve({ exitCode: code ?? -1, stdout, stderr }));
  });
}
