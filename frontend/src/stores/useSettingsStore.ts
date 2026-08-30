import { create } from "zustand";

interface SettingsState {
  apiKey: string;
  projectId: string;
  branch: string;
  commitId: string;

  // Actions
  setApiKey: (apiKey: string) => void;
  setProjectId: (projectId: string) => void;
  setBranch: (branch: string) => void;
  setCommitId: (commitId: string) => void;

  // Optional: A helper to update multiple fields at once
  updateSettings: (
    settings: Partial<
      Omit<
        SettingsState,
        | "setApiKey"
        | "setProjectId"
        | "setBranch"
        | "setCommitId"
        | "updateSettings"
      >
    >,
  ) => void;

  // Optional: Reset to defaults
  reset: () => void;
}

const initialState = {
  apiKey: "",
  projectId: "",
  branch: "main", // default value
  commitId: "",
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...initialState,

  setApiKey: (apiKey) => set({ apiKey }),
  setProjectId: (projectId) => set({ projectId }),
  setBranch: (branch) => set({ branch }),
  setCommitId: (commitId) => set({ commitId }),

  updateSettings: (settings) => set((state) => ({ ...state, ...settings })),

  reset: () => set(initialState),
  isSettingsOpen: true,
  isToolsOpen: true,
  toggleSettingsOpen: () =>
    set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  toggleToolsOpen: () => set((state) => ({ isToolsOpen: !state.isToolsOpen })),
}));
