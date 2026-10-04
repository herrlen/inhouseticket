"use client";

import { createContext, useContext } from "react";

export type LivePrefs = { confetti: boolean; setConfetti: (on: boolean) => void };

const PrefsContext = createContext<LivePrefs>({ confetti: false, setConfetti: () => {} });
export const PrefsProvider = PrefsContext.Provider;
export const usePrefs = () => useContext(PrefsContext);
