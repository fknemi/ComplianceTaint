import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  // Current active values
  apiKey: string;
  projectId: string;
  branch: string;
  commitId: string;

  // Dropdown history lists (The "Dropdown Thing")
  apiKeyOptions: string[];
  projectIdOptions: string[];
  branchOptions: string[];
  commitIdOptions: string[];

  // UI State
  isSettingsOpen: boolean;
  isToolsOpen: boolean;

  // Actions
  setApiKey: (val: string) => void;
  setProjectId: (val: string) => void;
  setBranch: (val: string) => void;
  setCommitId: (val: string) => void;
  toggleSettingsOpen: () => void;
  toggleToolsOpen: () => void;
  
  // Method to save a newly typed value into the dropdown options list
  saveToHistory: (key: 'apiKey' | 'projectId' | 'branch' | 'commitId', val: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
      projectId: "",
      branch: "",
      commitId: "",
      apiKeyOptions: ["sk_test_123"],
      projectIdOptions: ["proj_xyz"],
      branchOptions: ["main", "staging"],
      commitIdOptions: [],
      isSettingsOpen: true,
      isToolsOpen: false,

      setApiKey: (val) => set({ apiKey: val }),
      setProjectId: (val) => set({ projectId: val }),
      setBranch: (val) => set({ branch: val }),
      setCommitId: (val) => set({ commitId: val }),
      
      toggleSettingsOpen: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
      toggleToolsOpen: () => set((state) => ({ isToolsOpen: !state.isToolsOpen })),

      saveToHistory: (key, val) =>
        set((state) => {
          const optionsKey = `${key}Options` as keyof SettingsState;
          const currentList = state[optionsKey] as string[];
          if (!val || currentList.includes(val)) return {};
          return { [optionsKey]: [val, ...currentList].slice(0, 5) }; // Keeps latest 5 entries
        }),
    }),
    {
      name: 'settings-storage', // Saves to local storage automatically
    }
  )
);
