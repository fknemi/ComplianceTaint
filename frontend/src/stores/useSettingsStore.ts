import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  apiKey: string;
  projectId: string;
  branch: string;
  commitId: string;
  isSettingsOpen: boolean;
  isToolsOpen: boolean;
  setApiKey: (apiKey: string) => void;
  setProjectId: (projectId: string) => void;
  setBranch: (branch: string) => void;
  setCommitId: (commitId: string) => void;
  updateSettings: (settings: Partial<SettingsState>) => void;
  reset: () => void;
  toggleSettingsOpen: () => void;
  toggleToolsOpen: () => void;
}

const initialState = {
  apiKey: "",
  projectId: "",
  branch: "main",
  commitId: "",
  isSettingsOpen: true,
  isToolsOpen: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,
      setApiKey: (apiKey) => set({ apiKey }),
      setProjectId: (projectId) => set({ projectId }),
      setBranch: (branch) => set({ branch }),
      setCommitId: (commitId) => set({ commitId }),
      updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
      reset: () => set(initialState),
      toggleSettingsOpen: () =>
        set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      toggleToolsOpen: () =>
        set((state) => ({ isToolsOpen: !state.isToolsOpen })),
    }),
    {
      name: "settings-storage",
      partialize: (state) => ({
        apiKey: state.apiKey,
        projectId: state.projectId,
        branch: state.branch,
        commitId: state.commitId,
      }),
    },
  ),
);
