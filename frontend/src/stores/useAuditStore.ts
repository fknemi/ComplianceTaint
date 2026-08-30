import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Violation } from "@/types/graph";

interface AuditState {
  violations: Violation[];
  
  // Actions
  setViolations: (violations: Violation[]) => void;
  clearViolations: () => void;
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set) => ({
      violations: [], // Start with no violations
      
      setViolations: (violations) => set({ violations }),
      clearViolations: () => set({ violations: [] }),
    }),
    {
      name: "audit-store", // Key used in localStorage
      partialize: (state) => ({
        // We persist the violations so they survive page refreshes
        violations: state.violations,
      }),
    }
  )
);
