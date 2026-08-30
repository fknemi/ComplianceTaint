import { create } from "zustand";

// 1. Create the Zustand store
export const useSidebarStore = create((set) => ({
  isLeftCollapsed: false,
  isRightCollapsed: true,
  isLeftHidden: false,
  isRightHidden: false,

  // Actions
  toggleLeftCollapse: () =>
    set((state) => ({ isLeftCollapsed: !state.isLeftCollapsed })),
  toggleRightCollapse: () =>
    set((state) => ({ isRightCollapsed: !state.isRightCollapsed })),
  toggleLeftHidden: () =>
    set((state) => ({ isLeftHidden: !state.isLeftHidden })),
  toggleRightHidden: () =>
    set((state) => ({ isRightHidden: !state.isRightHidden })),
}));
