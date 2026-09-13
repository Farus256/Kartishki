import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Shipped catalog lives next to the server package, not the process cwd. */
export function bundledCatalogFile() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../data/catalog.json');
}

export function catalogFile(fromEnv = process.env.CATALOG_FILE) {
  const value = fromEnv?.trim();
  return value ? resolve(value) : bundledCatalogFile();
}
