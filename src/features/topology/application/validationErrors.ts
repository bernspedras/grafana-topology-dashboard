import type { ImportValidationError } from './topologyApi';

/** Extract schema validation error message from a backend 400 response. */
export function extractValidationError(err: unknown): string | undefined {
  const data = (err as { data?: { error?: string; details?: readonly string[] } } | undefined)?.data;
  if (data?.error === undefined || data.details === undefined) return undefined;
  return `${data.error}:\n${data.details.join('\n')}`;
}

/** Extract per-file validation errors from the ZIP import 400 response. */
export function extractImportValidationError(err: unknown): string | undefined {
  const data = (err as { data?: { error?: string; files?: readonly ImportValidationError['files'][number][] } } | undefined)?.data;
  if (data?.error === undefined || data.files === undefined) return undefined;
  const lines = data.files.map((f) => `${f.path}:\n  ${f.details.join('\n  ')}`);
  return `${data.error}:\n\n${lines.join('\n\n')}`;
}
