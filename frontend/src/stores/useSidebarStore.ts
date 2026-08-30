import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useSidebarStore = create(
  persist(
    (set) => ({
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
    }),
    {
      name: "sidebar-storage", // Unique key in localStorage
    }
  )
);
