import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { libraryMiddleware } from '../../app/server/library.mjs';

const exec = promisify(execFile);
const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const score = { title: '新建检查样例', format: '123', text: 'X:1\nT:检查样例\nM:4/4\nK:1=C\n1 2 3 4 | 5 6 7 1\' |]', key: '1=C', meter: '4/4', presentation: { noteSize: 24 }, source: { url: 'https://example.org/source', license: 'Synthetic test fixture' } };

async function fixture(t) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'nota-create-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const client = path.join(temporary, 'client'), artifacts = path.join(temporary, 'artifacts');
  await Promise.all([client, artifacts].map(directory => mkdir(directory)));
  const packed = JSON.parse((await exec('npm', ['pack', packageDirectory, '--pack-destination', artifacts, '--json'])).stdout)[0];
  await exec('npm', ['install', '--prefix', client, '--no-audit', '--no-fund', '--ignore-scripts', path.join(artifacts, packed.filename)]);
  const token = randomBytes(32).toString('hex'), credentials = path.join(temporary, 'credentials.json');
  await writeFile(credentials, JSON.stringify({ credentials: [{ name: 'fixture', sha256: createHash('sha256').update(token).digest('hex') }] }));
  const previous = process.env.NOTA_TOOL_CREDENTIALS_FILE;
  process.env.NOTA_TOOL_CREDENTIALS_FILE = credentials;
  t.after(() => { if (previous === undefined) delete process.env.NOTA_TOOL_CREDENTIALS_FILE; else process.env.NOTA_TOOL_CREDENTIALS_FILE = previous; });
  const middleware = libraryMiddleware(path.join(temporary, 'storage'));
  let loseCreateResponse = false, hideReads = false;
  const server = createServer((req, res) => {
    if (hideReads && req.method === 'GET') { res.destroy(); return; }
    if (loseCreateResponse && req.method === 'POST' && req.url === '/api/agent/library') {
      const end = res.end.bind(res);
      res.end = (...args) => { res.destroy(); loseCreateResponse = false; return end(...args); };
    }
    void middleware(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = async (args, payload) => {
    if (payload) await writeFile(path.join(client, 'proposal.json'), JSON.stringify(payload));
    try {
      const result = await exec(process.execPath, [path.join(client, 'node_modules/.bin/nota-library'), ...args], { cwd: client, env: { ...process.env, NOTA_CONFIG: path.join(client, 'config.json'), NOTA_URL: url, NOTA_TOKEN: token } });
      return { code: 0, output: JSON.parse(result.stdout) };
    } catch (error) { return { code: error.code, output: JSON.parse(error.stdout) }; }
  };
  const raw = async (suffix, payload) => fetch(`${url}/api/agent/library${suffix}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return { run, raw, url, lose: () => { loseCreateResponse = true; }, hide: () => { hideReads = true; } };
}

test('安装的 CLI 经服务端检查新建、回读，并要求同名另建的明确意图', async t => {
  const { run, raw } = await fixture(t);
  const checked = await run(['check', '--file', 'proposal.json'], score);
  assert.equal(checked.code, 0);
  assert.equal(checked.output.data.ok, true);
  assert.equal((await run(['list'])).output.data.length, 0, 'check must not save');
  const created = await run(['create', '--file', 'proposal.json']);
  assert.equal(created.code, 0);
  assert.equal(created.output.status, 'created');
  assert.equal(created.output.data.record.text, score.text);
  assert.equal(created.output.data.record.revision, 1);
  assert.deepEqual(created.output.data.record.presentation, score.presentation);
  assert.equal(created.output.data.record.source.license, score.source.license);
  assert.match(created.output.data.url, /[?&]song=/);
  const duplicate = await run(['create', '--file', 'proposal.json']);
  assert.equal(duplicate.code, 9);
  assert.equal(duplicate.output.data.candidates[0].id, created.output.data.record.id);
  assert.equal((await run(['create', '--file', 'proposal.json', '--allow-duplicate-title'])).code, 0);
  const invalid = { ...score, title: '拒绝不合法谱文', text: score.text.replace('1 2 3 4', '1 2 3 @') };
  assert.equal((await raw('', invalid)).status, 422, 'direct POST cannot bypass checks');
  assert.equal((await run(['create', '--file', 'proposal.json'], invalid)).code, 7);
  assert.equal((await run(['list'])).output.data.length, 2);
});

test('服务端定位解析及拍数问题，合法弱起、连音和变拍可直接保存', async t => {
  const { run, raw } = await fixture(t);
  for (const [text, code, measure] of [
    ['X:1\nM:4/4\nK:1=C\n1 2 3 4 | 1 2 3 |]', 'measure_duration', 2],
    ['X:1\nM:4/4\nK:1=C\n1 2 @ 4 |]', 'lex', undefined],
    ['X:1\nM:4/4\nK:1=C\n0 0 0 0 |]', 'no_melody', undefined],
  ]) {
    const response = await raw('/check', { ...score, text });
    assert.equal(response.status, 422);
    const report = await response.json();
    const diagnostic = report.diagnostics.find(d => d.code === code);
    assert.ok(diagnostic, JSON.stringify(report));
    if (measure) assert.equal(diagnostic.measure, measure);
    if (code !== 'no_melody') assert.ok(diagnostic.source && diagnostic.source.line >= 3);
    assert.equal((await raw('', { ...score, text })).status, 422);
  }
  for (const [index, text] of [
    'X:1\nM:4/4\nK:1=C\n1 | 1 2 3 4 | 1 2 3 |]',
    'X:1\nM:4/4\nK:1=C\n(3:1_2_3_) 4 5 6 |]',
    'X:1\nM:4/4\nK:1=C\n1 2 3 4 | [M:3/4] 5 6 7 |]',
  ].entries()) {
    const created = await run(['create', '--file', 'proposal.json'], { ...score, title: `合法结构${index}`, text });
    assert.equal(created.code, 0, JSON.stringify(created.output));
  }
  const malformedXml = await raw('', { ...score, title: '坏XML', format: 'musicxml', text: '<score-partwise><part></score-partwise>' });
  assert.equal(malformedXml.status, 422);
  assert.equal((await run(['list'])).output.data.length, 3);
});

test('新建响应丢失先用请求编号回读核实，不重复 POST 或误报成功', async t => {
  const { run, lose, hide } = await fixture(t);
  lose();
  const recovered = await run(['create', '--file', 'proposal.json'], score);
  assert.equal(recovered.code, 0, JSON.stringify(recovered.output));
  assert.equal((await run(['list'])).output.data.length, 1);
  lose(); hide();
  const unknown = await run(['create', '--file', 'proposal.json'], { ...score, title: '结果未确认样例' });
  assert.equal(unknown.code, 8);
  assert.equal(unknown.output.code, 'result_unconfirmed');
  assert.equal(unknown.output.data.file, 'proposal.json');
  assert.match(unknown.output.data.requestId, /^[0-9a-f-]{36}$/);
});
