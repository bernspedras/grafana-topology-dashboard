import { createContext, useContext } from 'react';
import type { ColoringMode } from '../application/metricColor';

export interface ViewOptions {
  readonly showNAMetrics: boolean;
  readonly showFlowStepCards: boolean;
  readonly lowPolyMode: boolean;
  readonly sequenceDiagramMode: boolean;
  readonly coloringMode: ColoringMode;
}

export type ViewOptionKey = 'showNAMetrics' | 'showFlowStepCards' | 'lowPolyMode' | 'sequenceDiagramMode';

export interface ViewOptionsContextValue {
  readonly options: ViewOptions;
  readonly toggle: (key: ViewOptionKey) => void;
  readonly setColoringMode: (mode: ColoringMode) => void;
}

const ViewOptionsContext = createContext<ViewOptionsContextValue>({
  options: { showNAMetrics: true, showFlowStepCards: true, lowPolyMode: false, sequenceDiagramMode: false, coloringMode: 'baseline' },
  toggle: () => { /* noop default */ },
  setColoringMode: () => { /* noop default */ },
});

export const ViewOptionsProvider = ViewOptionsContext.Provider;

export function useViewOptions(): ViewOptionsContextValue {
  return useContext(ViewOptionsContext);
}
