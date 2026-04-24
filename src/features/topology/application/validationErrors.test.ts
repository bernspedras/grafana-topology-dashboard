import { extractValidationError, extractImportValidationError } from './validationErrors';

describe('extractValidationError', () => {
  it('returns formatted message when error has data.error and data.details', () => {
    const err = { data: { error: 'Validation failed', details: ['field "id" is required', 'field "name" must be a string'] } };
    expect(extractValidationError(err)).toBe('Validation failed:\nfield "id" is required\nfield "name" must be a string');
  });

  it('returns undefined when data is missing', () => {
    expect(extractValidationError({})).toBeUndefined();
  });

  it('returns undefined when data.error is missing', () => {
    expect(extractValidationError({ data: { details: ['x'] } })).toBeUndefined();
  });

  it('returns undefined when data.details is missing', () => {
    expect(extractValidationError({ data: { error: 'fail' } })).toBeUndefined();
  });

  it('returns undefined for non-object errors', () => {
    expect(extractValidationError('string error')).toBeUndefined();
    expect(extractValidationError(null)).toBeUndefined();
    expect(extractValidationError(undefined)).toBeUndefined();
    expect(extractValidationError(42)).toBeUndefined();
  });

  it('handles empty details array', () => {
    const err = { data: { error: 'Validation failed', details: [] as string[] } };
    expect(extractValidationError(err)).toBe('Validation failed:\n');
  });
});

describe('extractImportValidationError', () => {
  it('returns formatted per-file errors', () => {
    const err = {
      data: {
        error: 'Import validation failed',
        files: [
          { path: 'flows/main.json', details: ['missing "id"', 'invalid "name"'] },
          { path: 'templates/nodes/svc.json', details: ['unknown kind'] },
        ],
      },
    };
    const result = extractImportValidationError(err);
    expect(result).toBe(
      'Import validation failed:\n\nflows/main.json:\n  missing "id"\n  invalid "name"\n\ntemplates/nodes/svc.json:\n  unknown kind',
    );
  });

  it('returns undefined when data is missing', () => {
    expect(extractImportValidationError({})).toBeUndefined();
  });

  it('returns undefined when data.error is missing', () => {
    expect(extractImportValidationError({ data: { files: [] } })).toBeUndefined();
  });

  it('returns undefined when data.files is missing', () => {
    expect(extractImportValidationError({ data: { error: 'fail' } })).toBeUndefined();
  });

  it('returns undefined for non-object errors', () => {
    expect(extractImportValidationError(null)).toBeUndefined();
    expect(extractImportValidationError(undefined)).toBeUndefined();
  });

  it('handles empty files array', () => {
    const err = { data: { error: 'Import validation failed', files: [] as { path: string; details: string[] }[] } };
    expect(extractImportValidationError(err)).toBe('Import validation failed:\n\n');
  });

  it('handles single file with single detail', () => {
    const err = {
      data: {
        error: 'Validation error',
        files: [{ path: 'flows/x.json', details: ['bad field'] }],
      },
    };
    expect(extractImportValidationError(err)).toBe('Validation error:\n\nflows/x.json:\n  bad field');
  });
});
