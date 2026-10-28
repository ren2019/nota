import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { libraryMiddleware } from '../../app/server/library.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));

test('私下交付包在仓库外解包后可安装CLI并连接真实曲谱库，skill资源可直接交给安装工具', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'nota-delivery-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const out = path.join(temporary, 'artifacts'), unpacked = path.join(temporary, 'unpacked'), client = path.join(temporary, 'client');
  await Promise.all([out, unpacked, client].map(p => mkdir(p)));
  const built = await exec(process.execPath, [path.join(root, 'scripts/package-agent-tools.mjs'), '--out', out], { cwd: root });
  const artifact = JSON.parse(built.stdout);
  await exec('tar', ['-xzf', artifact.archive, '-C', unpacked]);
  const delivered = path.join(unpacked, 'nota-agent-tools-0.1.0');
  await exec('npm', ['install', '--prefix', client, '--ignore-scripts', '--no-audit', '--no-fund', path.join(delivered, 'cli/nota-cli-0.1.0.tgz')]);
  const command = path.join(client, 'node_modules/.bin/nota-library');
  const version = JSON.parse((await exec(process.execPath, [command, '--version'], { cwd: client })).stdout);
  assert.equal(version.data.version, '0.1.0');
  const skill = await readFile(path.join(delivered, 'skill/nota-library/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: nota-library\n/);
  for (const reference of [...skill.matchAll(/\]\((references\/[^)]+)\)/g)].map(m => m[1])) {
    assert.ok((await readFile(path.join(delivered, 'skill/nota-library', reference))).length, reference);
  }
  assert.ok((await readFile(path.join(delivered, 'LICENSE'))).length);
  const token = randomBytes(32).toString('hex'), credentials = path.join(temporary, 'credentials.json');
  await writeFile(credentials, JSON.stringify({ credentials: [{ name: 'test', sha256: createHash('sha256').update(token).digest('hex') }] }));
  const previous = process.env.NOTA_TOOL_CREDENTIALS_FILE;
  process.env.NOTA_TOOL_CREDENTIALS_FILE = credentials;
  t.after(() => { if (previous === undefined) delete process.env.NOTA_TOOL_CREDENTIALS_FILE; else process.env.NOTA_TOOL_CREDENTIALS_FILE = previous; });
  const middleware = libraryMiddleware(path.join(temporary, 'storage'));
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end(); }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const env = { ...process.env, NOTA_URL: `http://127.0.0.1:${server.address().port}`, NOTA_TOKEN: token, NOTA_CONFIG: path.join(client, 'config.json') };
  const listed = JSON.parse((await exec(process.execPath, [command, 'list'], { cwd: client, env })).stdout);
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.data, []);
});
