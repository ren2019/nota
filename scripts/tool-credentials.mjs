#!/usr/bin/env node
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

// Deployment-side administration; secret values are written to a dedicated file only.
try {
  const [command, ...args] = process.argv.slice(2);
  const option = name => args[args.indexOf(name) + 1];
  if (!['issue', 'revoke'].includes(command) || !args.includes('--file') || !args.includes('--name')) throw new Error('用法：issue|revoke --file <凭据文件> --name <个人名称> [--out <明文交付文件>]');
  const filename = option('--file');
  const name = option('--name');
  if (!name || name.startsWith('--')) throw new Error('请提供个人名称。');
  let credentials = [];
  try { ({ credentials } = JSON.parse(await readFile(filename, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取凭据文件；未修改任何记录。'); }
  if (!Array.isArray(credentials)) throw new Error('凭据文件格式不正确。');
  if (command === 'issue') {
    if (!args.includes('--out') || !option('--out') || option('--out').startsWith('--')) throw new Error('发放时请指定私有明文交付文件 --out。');
    if (credentials.some(item => item.name === name)) throw new Error('该名称已经存在；先撤销旧凭据，或使用另一个名称。');
    const token = randomBytes(32).toString('hex');
    const tokenFile = option('--out');
    await mkdir(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
    await writeFile(tokenFile, token + '\n', { mode: 0o600, flag: 'wx' });
    credentials.push({ name, sha256: createHash('sha256').update(token).digest('hex') });
  } else {
    if (!credentials.some(item => item.name === name)) throw new Error('未找到该个人凭据；未修改文件。');
    credentials = credentials.filter(item => item.name !== name);
  }
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify({ credentials }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, filename);
  process.stdout.write(JSON.stringify({ ok: true, status: command === 'issue' ? 'issued' : 'revoked' }) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, message: error.message }) + '\n');
  process.exitCode = 1;
}
