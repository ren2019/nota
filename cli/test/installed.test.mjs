import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { libraryMiddleware } from '../../app/server/library.mjs';

const exec = promisify(execFile);
const packageDirectory = fileURLToPath(new URL('../', import.meta.url));

test('独立安装的 CLI 配置后查找候选并完整读取真实 HTTP 库，凭据可单独即时撤销', async t => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'nota-installed-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifacts = path.join(temporary, 'artifacts');
  const client = path.join(temporary, 'client');
  const storage = path.join(temporary, 'library');
  await Promise.all([artifacts, client, storage].map(directory => mkdir(directory)));
  const packed = JSON.parse((await exec('npm', ['pack', packageDirectory, '--pack-destination', artifacts, '--json'])).stdout)[0];
  await exec('npm', ['install', '--prefix', client, '--no-audit', '--no-fund', '--ignore-scripts', path.join(artifacts, packed.filename)]);
  const binary = path.join(client, 'node_modules/.bin/nota-library');
  const tokens = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
  const credentialsFile = path.join(temporary, 'credentials.json');
  const configureCredentials = async active => writeFile(credentialsFile, JSON.stringify({ credentials: active.map(index => ({ name: `person-${index}`, sha256: createHash('sha256').update(tokens[index]).digest('hex') })) }), { mode: 0o600 });
  await configureCredentials([0, 1]);
  const previousFile = process.env.NOTA_TOOL_CREDENTIALS_FILE;
  process.env.NOTA_TOOL_CREDENTIALS_FILE = credentialsFile;
  t.after(() => { if (previousFile === undefined) delete process.env.NOTA_TOOL_CREDENTIALS_FILE; else process.env.NOTA_TOOL_CREDENTIALS_FILE = previousFile; });
  const id = '12345678-1234-1234-1234-123456789abc';
  const record = { id, title: '读取验收谱', format: '123', text: 'T:读取验收谱\nK:1=C\n1 2 3 4 |]', key: '1=C', meter: '4/4', revision: 3, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', project: 'UEs=', presentation: { noteSize: 22 }, source: { license: '测试数据', url: 'https://example.com/test' } };
  await writeFile(path.join(storage, `${id}.json`), JSON.stringify(record));
  await writeFile(path.join(storage, '22345678-1234-1234-1234-123456789abc.json'), JSON.stringify({ ...record, id: '22345678-1234-1234-1234-123456789abc', updatedAt: '2026-01-03T00:00:00Z' }));
  const middleware = libraryMiddleware(storage);
  // Real deployment-shaped entry: gateway guards browser routes; machine route uses Nota bearer verification.
  const server = createServer((req, res) => {
    if (!req.url.startsWith('/api/agent/') && req.headers.cookie !== 'session=fixture') { res.writeHead(401); res.end('网页需要登录'); return; }
    void middleware(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = path.join(client, 'config.json');
  const run = async (args, extra = {}) => {
    try {
      const result = await exec(process.execPath, [binary, ...args], { cwd: client, env: { ...process.env, NOTA_CONFIG: config, ...extra } });
      return { code: 0, output: JSON.parse(result.stdout) };
    } catch (error) { return { code: error.code, output: JSON.parse(error.stdout) }; }
  };
  const configured = await run(['config', '--url', base], { NOTA_TOKEN: tokens[0] });
  assert.equal(configured.code, 0);
  assert.equal(JSON.stringify(configured.output).includes(tokens[0]), false);
  const list = await run(['list']);
  assert.equal(list.code, 0);
  assert.equal(list.output.data.length, 2);
  assert.equal(list.output.data[0].text, undefined);
  const found = await run(['find', '读取验收']);
  assert.equal(found.output.status, 'candidates');
  assert.equal(found.output.data.length, 2);
  const read = await run(['get', id]);
  assert.deepEqual(read.output.data, record);
  assert.equal((await fetch(`${base}/api/library`)).status, 401);
  for (const authorization of [undefined, 'Bearer wrong']) {
    const denied = await fetch(`${base}/api/agent/library`, { headers: authorization ? { authorization } : {} });
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).code, 'unauthorized');
  }
  await configureCredentials([1]);
  const revoked = await run(['list']);
  assert.equal(revoked.code, 3);
  assert.equal(revoked.output.code, 'unauthorized');
  assert.equal((await run(['list'], { NOTA_TOKEN: tokens[1] })).code, 0);
  await rm(credentialsFile);
  assert.equal((await run(['list'], { NOTA_TOKEN: tokens[1] })).code, 3);
  const invalid = await run(['get', 'not-an-id']);
  assert.equal(invalid.code, 2);
});
