import { useState, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FlowStepDraft {
  readonly id?: string;
  readonly step: number;
  readonly text: string;
}

interface UseFlowStepEditorResult {
  readonly saving: boolean;
  readonly error: string | undefined;
  readonly save: (flowSteps: readonly FlowStepDraft[]) => Promise<boolean>;
}

// ─── Hook (stub — no backend in Grafana plugin mode) ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useFlowStepEditor(_topologyId: string): UseFlowStepEditorResult {
  const [saving] = useState(false);
  const [error] = useState<string | undefined>(undefined);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const save = useCallback((_flowSteps: readonly FlowStepDraft[]): Promise<boolean> => {
    // no-op in plugin mode
    return Promise.resolve(true);
  }, []);

  return { saving, error, save };
}
