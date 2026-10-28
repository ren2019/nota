#!/usr/bin/env node
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { normalizeSourceProvenance } from './source-provenance.mjs';

const configFile = process.env.NOTA_CONFIG || path.join(homedir(), '.config/nota-library/config.json');
const exits = { usage: 2, unauthorized: 3, connection: 4, not_found: 5, conflict: 6, validation: 7, result_unconfirmed: 8, ambiguous: 9, server: 10 };
const fail = (code, message, data) => Object.assign(new Error(message), { code, data });
const output = value => process.stdout.write(JSON.stringify(value) + '\n');

function instance(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('usage', '请提供完整的实例 URL。'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw fail('usage', '实例必须使用 HTTPS；本机测试可使用环回 HTTP。');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw fail('usage', '实例地址使用站点根路径，不包含凭据、查询或片段。');
  return url.origin;
}

async function configuration() {
  let saved = {};
  try { saved = JSON.parse(await readFile(configFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw fail('usage', '无法读取配置文件，请重新配置。'); }
  const url = instance(process.env.NOTA_URL || saved.url);
  const token = process.env.NOTA_TOKEN || saved.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw fail('unauthorized', '请先配置个人工具凭据。');
  return { url, token };
}

async function request(config, suffix = '', init = {}) {
  let response;
  try {
    response = await fetch(`${config.url}/api/agent/library${suffix}`, { ...init, headers: { Authorization: `Bearer ${config.token}`, ...init.headers }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch { throw fail('connection', '未能连接 Nota 实例，请检查连接后重试读取。'); }
  const statusCode = response.status;
  const code = statusCode === 401 || statusCode === 403 ? 'unauthorized' : statusCode === 404 ? 'not_found' : statusCode === 409 ? 'conflict' : statusCode === 400 || statusCode === 415 || statusCode === 422 ? 'validation' : 'server';
  let value;
  try { value = await response.json(); } catch { throw fail(response.ok ? 'server' : code, '实例未返回曲谱库 JSON；请检查机器入口和网关配置。'); }
  if (!response.ok) throw fail(value.code === 'ambiguous' ? 'ambiguous' : code, typeof value.error === 'string' ? value.error : 'Nota 拒绝了请求。', value.data ?? value);
  return value;
}

function retainedContent(record) {
  const { revision: _revision, updatedAt: _updatedAt, deletedAt: _deletedAt, ...retained } = record;
  return retained;
}

async function changeDeletionState(config, command, id, revision) {
  const restoring = command === 'restore';
  const before = await request(config, restoring ? `/deleted/${id}` : `/${id}`);
  if (before.id !== id || before.revision !== revision) throw fail('conflict', '曲谱版本已变化，请重新读取后确认；本次操作未提交。');
  try {
    await request(config, `/${id}${restoring ? '/restore' : ''}`, { method: restoring ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision }) });
  } catch (error) {
    // An interrupted response may follow a committed write. Verify, never retry the mutation.
    if (!['connection', 'server'].includes(error.code)) throw error;
  }
  let after;
  try { after = await request(config, restoring ? `/${id}` : `/deleted/${id}`); }
  catch { throw fail('result_unconfirmed', '操作已提交，但结果尚未核实。请重新读取或查看已删除列表，不要自动重试。', { id, expectedRevision: revision + 1 }); }
  if (after.id !== id || after.revision !== revision + 1 || !!after.deletedAt === restoring || !isDeepStrictEqual(retainedContent(before), retainedContent(after))) {
    throw fail('result_unconfirmed', '回读状态与本次预期不一致，可能已有后续修改。请重新读取后确认。', { id, expectedRevision: revision + 1, actualRevision: after.revision });
  }
  return output({ ok: true, status: restoring ? 'restored' : 'deleted', data: { ...after, url: `${config.url}/?screen=detail&song=${id}` } });
}

function expectedUpdate(before, proposal) {
  const mergeObject = (previous, patch) => {
    const base = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    return { ...base, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key,
      value && typeof value === 'object' && !Array.isArray(value) ? mergeObject(base[key], value) : value])) };
  };
  const result = { ...before };
  for (const key of ['title','format','text','key','meter','project','source','presentation']) if (Object.hasOwn(proposal, key)) {
    result[key] = ['source','presentation'].includes(key) ? mergeObject(before[key], proposal[key]) : proposal[key];
  }
  result.title = result.title.trim();
  result.key = typeof result.key === 'string' ? result.key.slice(0,24) : '';
  result.meter = typeof result.meter === 'string' ? result.meter.slice(0,24) : '';
  if (result.source) result.source = normalizeSourceProvenance(result.source, result.text, before.source);
  return result;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--version' || command === 'version') return output({ ok: true, status: 'version', data: { version: JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8')).version } });
  if (!command || command === '--help' || command === 'help') return output({ ok: true, status: 'help', data: {
    commands: ['config --url https://nota.example.com [--token-stdin]', 'list', 'find <曲名>', 'get <曲谱唯一编号>', 'check --file <JSON文件>', 'check <曲谱唯一编号> --revision <版本> --file <JSON文件>', 'create --file <JSON文件> [--allow-duplicate-title]', 'update <曲谱唯一编号> --revision <版本> --file <JSON文件>', 'deleted', 'delete <曲谱唯一编号> --revision <版本>', 'restore <曲谱唯一编号> --revision <版本>'],
    configuration: '凭据通过 NOTA_TOKEN 环境变量或 --token-stdin 配置；NOTA_CONFIG 可指定私有配置文件，默认 ~/.config/nota-library/config.json。',
    exits,
  } });
  if (command === 'config') {
    const index = args.indexOf('--url');
    if (index < 0 || !args[index + 1] || args.some((arg, i) => i !== index + 1 && !['--url', '--token-stdin'].includes(arg))) throw fail('usage', '用法：config --url <实例地址> [--token-stdin]');
    const url = instance(args[index + 1]);
    let token = process.env.NOTA_TOKEN;
    if (args.includes('--token-stdin')) {
      const chunks = [];
      for await (const chunk of process.stdin) { chunks.push(chunk); if (chunks.reduce((sum, part) => sum + part.length, 0) > 1024) throw fail('usage', '凭据输入过长。'); }
      token = Buffer.concat(chunks).toString('utf8').trim();
    }
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw fail('usage', '通过 NOTA_TOKEN 或 --token-stdin 提供个人工具凭据。');
    await mkdir(path.dirname(configFile), { recursive: true, mode: 0o700 });
    const temporary = `${configFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ url, token }) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, configFile);
    return output({ ok: true, status: 'configured' });
  }
  if (command === 'update' || (command === 'check' && args[0] && !args[0].startsWith('--'))) {
    if (args.length !== 5 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(args[0]) || args[1] !== '--revision' || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])) || args[3] !== '--file') throw fail('usage', `${command} <曲谱编号> --revision <版本> --file <JSON文件>`);
    const [id, , revisionText, , file] = args, revision = Number(revisionText);
    let proposal;
    try { proposal = JSON.parse(await readFile(file, 'utf8')); } catch { throw fail('usage', '无法读取提案 JSON 文件。'); }
    if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw fail('usage', '提案必须是 JSON 对象。');
    const config = await configuration(), before = await request(config, `/${id}`);
    if (before.id !== id || before.revision !== revision) throw fail('conflict', '曲谱版本已变化；待提交文件已保留，请重新读取后核对。', { id, expectedRevision: revision, actualRevision: before.revision, file });
    const payload = { ...proposal, revision };
    const json = (method, value) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const report = await request(config, `/${id}/check`, json('POST', payload));
    if (command === 'check') return output({ ok: true, status: 'checked', data: report });
    let saved;
    try { saved = await request(config, `/${id}`, json('PUT', payload)); }
    catch (error) { if (!['connection','server'].includes(error.code)) throw error; }
    let record;
    try { record = await request(config, `/${id}`); }
    catch { throw fail('result_unconfirmed', '更新结果尚未核实；待提交文件已保留，请按编号回读，不要自动重试。', { id, expectedRevision: revision + 1, file }); }
    const expected = expectedUpdate(before, proposal);
    if (report.projectUpdate?.changed) {
      if (typeof record.project !== 'string' || createHash('sha256').update(Buffer.from(record.project, 'base64')).digest('hex') !== report.projectUpdate.sha256) throw fail('result_unconfirmed', '回读的原图项目不等于本次检查准备的项目；待提交文件已保留，请核对实际状态。', { id, expectedRevision: revision + 1, file });
      expected.project = record.project;
    }
    const retained = value => { const { revision: _revision, updatedAt: _updatedAt, ...content } = value; return content; };
    if ((saved && saved.revision !== revision + 1) || record.revision !== revision + 1 || !isDeepStrictEqual(retained(record), retained(expected))) throw fail('result_unconfirmed', '回读版本或内容不等于本次更新，可能已有后续修改；待提交文件已保留，请核对实际状态。', { id, expectedRevision: revision + 1, actualRevision: record.revision, file });
    return output({ ok: true, status: 'updated', data: { record, url: `${config.url}/?song=${encodeURIComponent(id)}&screen=detail`, check: saved?.check ?? report, summary: `已更新并回读「${record.title}」，修订版本 ${record.revision}。` } });
  }
  if (command === 'check' || command === 'create') {
    const at = args.indexOf('--file');
    if (at < 0 || !args[at + 1] || args.some((arg, i) => i !== at + 1 && !['--file', ...(command === 'create' ? ['--allow-duplicate-title'] : [])].includes(arg))) throw fail('usage', `${command} --file <JSON文件>${command === 'create' ? ' [--allow-duplicate-title]' : ''}`);
    let payload;
    try { payload = JSON.parse(await readFile(args[at + 1], 'utf8')); } catch { throw fail('usage', '无法读取提案 JSON 文件。'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail('usage', '提案必须是 JSON 对象。');
    const config = await configuration();
    const post = value => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const report = await request(config, '/check', post(payload));
    if (command === 'check') return output({ ok: true, status: 'checked', data: report });
    const requestId = randomUUID();
    payload = { ...payload, requestId, allowDuplicateTitle: args.includes('--allow-duplicate-title') };
    let saved;
    try { saved = await request(config, '', post(payload)); }
    catch (error) {
      if (!['connection', 'server'].includes(error.code)) throw error;
      // A lost write response is never permission to POST again. Reconcile this request, then read it.
      try {
        const candidates = await request(config);
        saved = Array.isArray(candidates) && candidates.find(item => item.submission?.requestId === requestId);
      } catch { /* Unknown outcome remains unknown. */ }
      if (!saved) throw fail('result_unconfirmed', '新建结果未确认；待提交文件已保留。请先查找并核实，勿重复新建。', { requestId, file: args[at + 1] });
    }
    let record;
    try { record = await request(config, `/${saved.id}`); }
    catch { throw fail('result_unconfirmed', '服务已返回保存结果，但回读未确认。请按编号核实，勿重复新建。', { id: saved.id, revision: saved.revision, requestId, file: args[at + 1] }); }
    const expected = { title: payload.title?.trim(), format: payload.format, text: payload.text, key: payload.key ?? '', meter: payload.meter ?? '' };
    const contentMatches = Object.entries(expected).every(([key, value]) => record[key] === value)
      && (payload.project ?? undefined) === record.project
      && JSON.stringify(payload.presentation) === JSON.stringify(record.presentation)
      && isDeepStrictEqual(normalizeSourceProvenance(payload.source, payload.text), record.source);
    if (saved.revision !== 1 || record.id !== saved.id || record.revision !== saved.revision || record.submission?.requestId !== requestId || !contentMatches) throw fail('result_unconfirmed', '回读内容或版本与本次保存不同；请核对实际状态，勿覆盖或重复新建。', { id: saved.id, revision: saved.revision, actualRevision: record.revision, requestId, file: args[at + 1] });
    return output({ ok: true, status: 'created', data: { record, url: `${config.url}/?song=${encodeURIComponent(record.id)}&screen=detail`, check: report, summary: `已新建并回读「${record.title}」，修订版本 ${record.revision}。` } });
  }
  if (!['list', 'find', 'get', 'deleted', 'delete', 'restore'].includes(command)) throw fail('usage', '未知命令；运行 --help 查看用法。');

  if (command === 'get' && (args.length !== 1 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(args[0]))) throw fail('usage', 'get 需要一个有效的曲谱唯一编号。');
  if (command === 'find' && (args.length !== 1 || !args[0].trim())) throw fail('usage', 'find 需要一个曲名查询。');
  if (command === 'list' && args.length) throw fail('usage', 'list 不接受参数。');
  if (command === 'deleted' && args.length) throw fail('usage', 'deleted 不接受参数。');
  if (command === 'delete' || command === 'restore') {
    if (args.length !== 3 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(args[0]) || args[1] !== '--revision' || !/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2]))) throw fail('usage', `${command} 需要有效曲谱编号和 --revision <版本>。`);
    return changeDeletionState(await configuration(), command, args[0], Number(args[2]));
  }
  const config = await configuration();
  const data = await request(config, command === 'get' ? `/${args[0]}` : command === 'deleted' ? '/deleted' : '');
  if (command === 'get') return output({ ok: true, status: 'read', data });
  if (!Array.isArray(data)) throw fail('server', '实例返回的曲谱列表格式不正确。');
  const matches = command === 'find' ? data.filter(item => typeof item.title === 'string' && item.title.toLocaleLowerCase().includes(args[0].trim().toLocaleLowerCase())) : data;
  return output({ ok: true, status: command === 'find' ? 'candidates' : 'listed', data: matches });
}

main().catch(error => {
  const code = Object.hasOwn(exits, error.code) ? error.code : 'server';
  output({ ok: false, code, message: code === 'server' ? '无法完成操作，请检查服务或配置后重试。' : error.message, ...(error.data === undefined ? {} : { data: error.data }) });
  process.exitCode = exits[code];
});
