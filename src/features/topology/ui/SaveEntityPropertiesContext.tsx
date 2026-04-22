import React, { createContext, useContext } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EntityPropertySave {
  readonly entityId: string;
  readonly entityType: 'node' | 'edge';
  /** Fields to set on the flow ref (overridable fields). undefined = no ref changes. */
  readonly refPatch: Record<string, unknown> | undefined;
  /** Fields to set on the template (template-only fields). undefined = no template changes. */
  readonly templatePatch: Record<string, unknown> | undefined;
  /** For inline entities, the complete property patch. undefined = not inline. */
  readonly inlinePatch: Record<string, unknown> | undefined;
}

export type SaveEntityPropertiesFn = (save: EntityPropertySave) => Promise<void>;

// ─── Context ────────────────────────────────────────────────────────────────

const SaveEntityPropertiesContext = createContext<SaveEntityPropertiesFn | undefined>(undefined);

export function SaveEntityPropertiesProvider({
  value,
  children,
}: {
  readonly value: SaveEntityPropertiesFn;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <SaveEntityPropertiesContext.Provider value={value}>
      {children}
    </SaveEntityPropertiesContext.Provider>
  );
}

export function useSaveEntityProperties(): SaveEntityPropertiesFn | undefined {
  return useContext(SaveEntityPropertiesContext);
}
