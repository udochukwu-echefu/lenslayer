import { pathToFileURL } from 'node:url';

export class Incomplete extends Error {}
export const requireThat = (condition, code) => { if (!condition) throw new Incomplete(code); };
export const isMain = (url) => process.argv[1] && url === pathToFileURL(process.argv[1]).href;
export const emit = (record) => process.stdout.write(JSON.stringify(record) + '\n');

// Never fall back to an echoing terminal reader. Pipe input directly from an
// authorized parent process, or paste a single JSON line at the hidden TTY.
export function hiddenJSON({ input = process.stdin, output = process.stderr, timeoutMs = 120000, signals = process } = {}) {
  return new Promise((resolve, reject) => {
    let text = '', done = false;
    const wasRaw = input.isRaw ?? false;
    // A fresh Node TTY has readableFlowing=null but isPaused()=false. Restoring
    // only isPaused() would leave that initially idle terminal flowing/ref'ed.
    const wasFlowing = input.readableFlowing === true;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      input.removeListener('data', data);
      input.removeListener('end', ended);
      input.removeListener('error', failed);
      for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGTSTP']) signals.removeListener(name, interrupted);
      if (input.isTTY) input.setRawMode(wasRaw);
      if (!wasFlowing) input.pause();
      if (input.isTTY) output.write('\n');
      if (error) { text = ''; reject(new Incomplete(error)); return; }
      try { const result = JSON.parse(text); text = ''; resolve(result); }
      catch { text = ''; reject(new Incomplete('hidden_input_invalid')); }
    };
    const interrupted = () => finish('interrupted');
    const ended = () => finish(text ? null : 'hidden_input_closed');
    const failed = () => finish('hidden_input_failed');
    const data = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if ('\u0003\u0004\u001a'.includes(char)) { finish('interrupted'); return; }
        if (char === '\r' || char === '\n') { finish(null); return; }
        if (char === '\u007f' || char === '\b') text = text.slice(0, -1);
        else text += char;
        if (text.length > 65536) { finish('hidden_input_too_large'); return; }
      }
    };
    const timer = setTimeout(() => finish('hidden_input_timeout'), timeoutMs);
    input.on('data', data).once('end', ended).once('error', failed);
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGTSTP']) signals.once(name, interrupted);
    try {
      if (input.isTTY) { input.setRawMode(true); output.write('Paste authorized in-memory JSON (hidden), then Enter: '); }
      input.resume();
    } catch { finish('hidden_tty_unavailable'); }
  });
}

export function instant(value) {
  requireThat(typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), 'invalid_timestamp');
  return Date.parse(value);
}

export async function boundedResponse(response, signal) {
  let size = 0;
  const chunks = [];
  const reader = response.body?.getReader();
  try {
    while (reader) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      requireThat(size <= 65536, 'response_too_large');
      chunks.push(value);
    }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  } finally { await reader?.cancel().catch(() => {}); }
}

export function stopSignals() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const names = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  names.forEach((name) => process.once(name, stop));
  return { signal: controller.signal, close: () => names.forEach((name) => process.removeListener(name, stop)) };
}

export function failClosed(error) {
  // Never print exception messages, stacks, response bodies, URLs or headers.
  emit({ complete: false, reason: error instanceof Incomplete ? error.message : 'operation_failed', live_acceptance_claimed: false });
  process.exitCode = 1;
}
