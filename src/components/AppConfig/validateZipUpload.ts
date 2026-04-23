/** Maximum raw ZIP file size (10 MB). */
export const MAX_ZIP_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum cumulative size of all extracted entries (50 MB). */
export const MAX_EXTRACTED_SIZE = 50 * 1024 * 1024;

export interface ZipValidationError {
  readonly message: string;
}

/**
 * Validates a ZIP file size before extraction.
 * Returns an error message if invalid, or undefined if OK.
 */
export function validateZipFileSize(fileSize: number): ZipValidationError | undefined {
  if (fileSize > MAX_ZIP_FILE_SIZE) {
    return { message: 'ZIP file too large: ' + String(Math.round(fileSize / 1024 / 1024)) + 'MB (max ' + String(MAX_ZIP_FILE_SIZE / 1024 / 1024) + 'MB)' };
  }
  return undefined;
}

/**
 * Validates extracted ZIP entries for path traversal and cumulative size.
 * Returns an error message if invalid, or undefined if OK.
 */
export function validateZipEntries(entries: Record<string, Uint8Array>): ZipValidationError | undefined {
  let totalSize = 0;

  for (const [path, data] of Object.entries(entries)) {
    // Reject path traversal attempts.
    if (path.includes('..') || path.startsWith('/')) {
      return { message: `Invalid file path in ZIP: "${path}"` };
    }

    totalSize += data.byteLength;
    if (totalSize > MAX_EXTRACTED_SIZE) {
      return { message: 'Extracted files exceed size limit (max ' + String(MAX_EXTRACTED_SIZE / 1024 / 1024) + 'MB)' };
    }
  }

  return undefined;
}
