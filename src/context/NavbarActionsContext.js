"use client";

import { createContext, useContext, useState, useCallback } from 'react';

const NavbarActionsContext = createContext({
  actions: null,
  setActions: () => {},
});

export function NavbarActionsProvider({ children }) {
  const [actions, setActionsState] = useState(null);

  const setActions = useCallback((node) => {
    setActionsState(node);
  }, []);

  return (
    <NavbarActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </NavbarActionsContext.Provider>
  );
}

export function useNavbarActions() {
  return useContext(NavbarActionsContext);
}
