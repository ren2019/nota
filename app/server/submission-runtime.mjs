import { build } from 'esbuild';
import { DOMParser } from '@xmldom/xmldom';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

let pending;
export function submissionRuntime() {
  return pending ??= (async () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const output = path.join(root, 'out/nota-submission.mjs');
    await build({ entryPoints: [path.join(root, 'src/nota/submission-check.ts')], outfile: output, bundle: true, platform: 'node', format: 'esm' });
    globalThis.DOMParser ??= DOMParser;
    return import(pathToFileURL(output).href + '?v=' + Date.now());
  })().catch(error => { pending = undefined; throw error; });
}

export async function checkSubmission(input, options) {
  // Reject malformed XML before the editor's intentionally tolerant reader sees it.
  if (input?.format === 'musicxml' && typeof input.text === 'string') {
    try {
      if (/<!ENTITY/i.test(input.text)) throw new Error();
      const xml = new DOMParser({ onError: () => { throw new Error(); } }).parseFromString(input.text, 'application/xml');
      if (xml.documentElement?.localName !== 'score-partwise') throw new Error();
    } catch { return { ok: false, diagnostics: [{ severity: 'error', code: 'xml', message: '请提供格式完整、不含自定义实体的 score-partwise MusicXML。' }] }; }
  }
  return (await submissionRuntime()).checkSubmission(input, options);
}
