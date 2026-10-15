import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Node 24's built-in TS transformation executes the actual SDK source without an
// install, build output, package publication, or copied/reimplemented client.
const root = new URL('../../sdk/src/', import.meta.url).href;
let loadedSDK;
export function loadSDK() {
  return loadedSDK ??= importSource();
}
async function importSource() {
  const sourceHashes = {};
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(root) && /^\.\/[^/]+\.js$/.test(specifier)) {
        return next(new URL(specifier.replace(/\.js$/, '.ts'), context.parentURL).href, context);
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith(root) && url.endsWith('.ts')) {
        // Bypass Node's default strip-only loader before it rejects parameter properties.
        const source = readFileSync(new URL(url));
        sourceHashes['sdk/src/' + url.slice(root.length)] = createHash('sha256').update(source).digest('hex');
        return { format: 'module', source: stripTypeScriptTypes(source.toString('utf8'), { mode: 'transform' }), shortCircuit: true };
      }
      return next(url, context);
    },
  });
  try { return { ...await import('../../sdk/src/index.ts'), sourceHashes }; }
  finally { hook.deregister(); }
}
