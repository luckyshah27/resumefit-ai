import net from 'node:net';
import { env } from '../config/env.js';

export type ScanResult = { clean: boolean; engine: string; signature?: string };

export interface FileScanner {
  readonly engine: string;
  scan(buffer: Buffer): Promise<ScanResult>;
}

/** Local development default: uploads are validated and parsed (never executed) but not virus-scanned. */
export class NoopScanner implements FileScanner {
  readonly engine = 'none';
  async scan(): Promise<ScanResult> {
    return { clean: true, engine: this.engine };
  }
}

/** ClamAV daemon scanner using the clamd INSTREAM protocol over TCP. */
export class ClamdScanner implements FileScanner {
  readonly engine = 'clamav';
  constructor(private host: string, private port: number, private timeoutMs = 15000) {}

  scan(buffer: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('clamd timeout')));
      socket.on('error', reject);
      socket.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      socket.on('end', () => {
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
        if (/: OK$/.test(reply)) return resolve({ clean: true, engine: this.engine });
        const found = reply.match(/: (.+) FOUND$/);
        if (found) return resolve({ clean: false, engine: this.engine, signature: found[1] });
        return reject(new Error(`Unexpected clamd reply: ${reply.slice(0, 120)}`));
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const CHUNK = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += CHUNK) {
          const part = buffer.subarray(offset, offset + CHUNK);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(part.length, 0);
          socket.write(size);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
      });
    });
  }
}

let scanner: FileScanner | null = null;

export const getFileScanner = (): FileScanner => {
  if (!scanner) scanner = env.clamavHost ? new ClamdScanner(env.clamavHost, env.clamavPort) : new NoopScanner();
  return scanner;
};

/** For tests. */
export const setFileScanner = (next: FileScanner | null) => {
  scanner = next;
};
