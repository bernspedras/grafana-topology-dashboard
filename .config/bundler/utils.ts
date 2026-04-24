import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { SOURCE_DIR } from './constants';

export function getPackageJson() {
  return require(path.resolve(process.cwd(), 'package.json'));
}

export function getPluginJson() {
  return require(path.resolve(process.cwd(), SOURCE_DIR, 'plugin.json'));
}

export function getEntries(): Record<string, string> {
  const pluginJsonFiles = glob.sync('**/plugin.json', { cwd: path.resolve(process.cwd(), SOURCE_DIR) });
  const entries: Record<string, string> = {};
  for (const pluginJsonFile of pluginJsonFiles) {
    const folder = path.dirname(pluginJsonFile);
    const moduleFiles = glob.sync(`${folder}/module.{ts,tsx,js,jsx}`, {
      cwd: path.resolve(process.cwd(), SOURCE_DIR),
    });
    if (moduleFiles.length > 0) {
      entries[folder === '.' ? 'module' : `${folder}/module`] = path.resolve(
        process.cwd(),
        SOURCE_DIR,
        moduleFiles[0]
      );
    }
  }
  return entries;
}

export function isWSL(): boolean {
  try {
    const release = fs.readFileSync('/proc/version', 'utf8');
    return release.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

export function hasReadme(): boolean {
  return fs.existsSync(path.resolve(process.cwd(), SOURCE_DIR, 'README.md'));
}

export function getCPConfigVersion(): string {
  try {
    const cprc = require(path.resolve(process.cwd(), '.config', '.cprc.json'));
    return cprc.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
