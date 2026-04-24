import { createContext, useContext } from 'react';

export type DeleteCardFn = (entityId: string) => void;

const DeleteCardContext = createContext<DeleteCardFn | undefined>(undefined);

export const DeleteCardProvider = DeleteCardContext.Provider;

export function useDeleteCard(): DeleteCardFn | undefined {
  return useContext(DeleteCardContext);
}
