import { mkdtemp, mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('用法：package-agent-tools.mjs [--out 输出目录]');
const output = path.resolve(args[1] || path.join(root, 'local/releases'));
const { version } = JSON.parse(await readFile(path.join(root, 'cli/package.json'), 'utf8'));
const name = `nota-agent-tools-${version}`;
const temporary = await mkdtemp(path.join(tmpdir(), 'nota-agent-package-'));
try {
  const bundle = path.join(temporary, name);
  await mkdir(path.join(bundle, 'cli'), { recursive: true });
  await mkdir(path.join(bundle, 'skill'), { recursive: true });
  const packed = JSON.parse(execFileSync('npm', ['pack', path.join(root, 'cli'), '--pack-destination', path.join(bundle, 'cli'), '--json'], { encoding: 'utf8' }))[0];
  await cp(path.join(root, 'skills/nota-library'), path.join(bundle, 'skill/nota-library'), { recursive: true });
  await copyFile(path.join(root, 'LICENSE'), path.join(bundle, 'LICENSE'));
  await copyFile(path.join(root, 'cli/README.md'), path.join(bundle, 'CLI.md'));
  const guide = (await readFile(path.join(root, 'docs/agent-tools.md'), 'utf8')).replaceAll('../cli/README.md', 'CLI.md').replaceAll('(deployment.md)', '(https://github.com/ren2019/nota/blob/main/docs/deployment.md)');
  await writeFile(path.join(bundle, 'README.md'), guide);
  await mkdir(output, { recursive: true });
  const archive = path.join(output, `${name}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', temporary, name]);
  process.stdout.write(JSON.stringify({ version, archive, cli: packed.filename }) + '\n');
} finally { await rm(temporary, { recursive: true, force: true }); }
