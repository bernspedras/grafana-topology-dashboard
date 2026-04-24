/**
 * Generates a URL-safe slug from a topology name.
 * Lowercases, replaces non-alphanumeric runs with hyphens, and strips leading/trailing hyphens.
 */
export function topologySlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Generates a unique topology ID from a name, avoiding collisions with existing IDs.
 * Falls back to a timestamp-based ID if the slug is empty.
 */
export function uniqueTopologyId(name: string, existingIds: ReadonlySet<string>, nowMs?: number): string {
  const slug = topologySlug(name);
  const baseId = slug !== '' ? slug : 'topology-' + String(nowMs ?? Date.now());

  let id = baseId;
  let counter = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${String(counter)}`;
    counter++;
  }
  return id;
}
