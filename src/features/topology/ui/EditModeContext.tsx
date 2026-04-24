import { createContext, useContext } from 'react';

const EditModeContext = createContext(false);

export const EditModeProvider = EditModeContext.Provider;

export function useEditMode(): boolean {
  return useContext(EditModeContext);
}
