import {
  validateZipFileSize,
  validateZipEntries,
  MAX_ZIP_FILE_SIZE,
  MAX_EXTRACTED_SIZE,
} from './validateZipUpload';

describe('validateZipFileSize', () => {
  it('accepts a file within the size limit', () => {
    expect(validateZipFileSize(1024)).toBeUndefined();
  });

  it('accepts a file exactly at the limit', () => {
    expect(validateZipFileSize(MAX_ZIP_FILE_SIZE)).toBeUndefined();
  });

  it('rejects a file exceeding the size limit', () => {
    const result = validateZipFileSize(MAX_ZIP_FILE_SIZE + 1);
    expect(result).toBeDefined();
    expect(result?.message).toContain('too large');
  });
});

describe('validateZipEntries', () => {
  it('accepts valid entries', () => {
    const entries: Record<string, Uint8Array> = {
      'flows/my-flow.json': new Uint8Array(100),
      'templates/nodes/node-a.json': new Uint8Array(200),
      'templates/edges/a--b.json': new Uint8Array(150),
    };
    expect(validateZipEntries(entries)).toBeUndefined();
  });

  it('rejects entries with .. path traversal', () => {
    const entries: Record<string, Uint8Array> = {
      '../../../etc/passwd': new Uint8Array(10),
    };
    const result = validateZipEntries(entries);
    expect(result).toBeDefined();
    expect(result?.message).toContain('Invalid file path');
    expect(result?.message).toContain('..');
  });

  it('rejects entries with .. in the middle of the path', () => {
    const entries: Record<string, Uint8Array> = {
      'flows/../../../etc/shadow': new Uint8Array(10),
    };
    const result = validateZipEntries(entries);
    expect(result).toBeDefined();
    expect(result?.message).toContain('Invalid file path');
  });

  it('rejects entries with absolute paths', () => {
    const entries: Record<string, Uint8Array> = {
      '/etc/passwd': new Uint8Array(10),
    };
    const result = validateZipEntries(entries);
    expect(result).toBeDefined();
    expect(result?.message).toContain('Invalid file path');
  });

  it('rejects entries exceeding cumulative extracted size', () => {
    // Create entries that together exceed MAX_EXTRACTED_SIZE.
    const chunkSize = 10 * 1024 * 1024; // 10 MB each
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 6; i++) {
      entries['flows/flow-' + String(i) + '.json'] = new Uint8Array(chunkSize);
    }
    const result = validateZipEntries(entries);
    expect(result).toBeDefined();
    expect(result?.message).toContain('exceed size limit');
  });

  it('accepts entries exactly at the cumulative size limit', () => {
    const entries: Record<string, Uint8Array> = {
      'flows/big.json': new Uint8Array(MAX_EXTRACTED_SIZE),
    };
    expect(validateZipEntries(entries)).toBeUndefined();
  });

  it('accepts an empty zip', () => {
    expect(validateZipEntries({})).toBeUndefined();
  });
});
