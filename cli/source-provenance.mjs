import { createHash } from 'node:crypto';

const FIELDS = ['url', 'license', 'sha256', 'importedAt', 'validation', 'method', 'scope', 'part', 'importedTextHash'];
const IDENTITY_FIELDS = ['url', 'sha256', 'part', 'scope', 'method', 'importedTextHash'];
const field = (source, key) => String(source?.[key] ?? '').slice(0, 2048);

/** Shared wire normalization: a comparison belongs to its original source and scope. */
export function normalizeSourceProvenance(source, text, previousSource) {
  if (!source || typeof source !== 'object') return undefined;
  const normalized = { ...source, ...Object.fromEntries(FIELDS.map(key => [key, field(source, key)])) };
  if (previousSource && normalized.validation === 'source-compared' && IDENTITY_FIELDS.some(key => normalized[key] !== field(previousSource, key))) {
    normalized.validation = 'source-unverified';
  }
  normalized.edited = createHash('sha256').update(text).digest('hex') !== normalized.importedTextHash;
  return normalized;
}
