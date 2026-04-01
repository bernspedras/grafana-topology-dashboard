import { createContext, useContext } from 'react';

export interface ViewOptions {
  readonly showNAMetrics: boolean;
  readonly showFlowStepCards: boolean;
}

export type ViewOptionKey = keyof ViewOptions;

export interface ViewOptionsContextValue {
  readonly options: ViewOptions;
  readonly toggle: (key: ViewOptionKey) => void;
}

const ViewOptionsContext = createContext<ViewOptionsContextValue>({
  options: { showNAMetrics: true, showFlowStepCards: true },
  toggle: () => { /* noop default */ },
});

export const ViewOptionsProvider = ViewOptionsContext.Provider;

export function useViewOptions(): ViewOptionsContextValue {
  return useContext(ViewOptionsContext);
}
