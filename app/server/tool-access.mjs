import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';

/** A separate machine entrance: no browser cookies or caller-supplied identity are trusted. */
export async function authorizeToolRequest(req) {
  const unauthorized = () => Object.assign(new Error('工具访问凭据无效、未配置或已撤销。'), { status: 401, code: 'unauthorized' });
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.headers.authorization ?? '');
  const filename = process.env.NOTA_TOOL_CREDENTIALS_FILE;
  if (!match || !filename) throw unauthorized();
  const digest = createHash('sha256').update(match[1]).digest();
  try {
    const data = JSON.parse(await readFile(filename, 'utf8'));
    if (!Array.isArray(data.credentials)) throw unauthorized();
    let valid = false;
    for (const credential of data.credentials) {
      if (typeof credential?.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(credential.sha256)) continue;
      valid = timingSafeEqual(digest, Buffer.from(credential.sha256, 'hex')) || valid;
    }
    if (!valid) throw unauthorized();
  } catch { throw unauthorized(); }
}
