"use client";

import { createContext, useContext } from "react";

import type { ListColumn } from "@/components/tickets/list-columns";

export type LivePrefs = {
  confetti: boolean;
  setConfetti: (on: boolean) => void;
  /** List columns switched off by the person (saved in user_pref). */
  hiddenColumns: ListColumn[];
  setHiddenColumns: (columns: ListColumn[]) => void;
};

const PrefsContext = createContext<LivePrefs>({ confetti: false, setConfetti: () => {}, hiddenColumns: [], setHiddenColumns: () => {} });
export const PrefsProvider = PrefsContext.Provider;
export const usePrefs = () => useContext(PrefsContext);
