import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GraphElement, Violation } from "@/types/graph";
import { useEffect, useRef, useMemo, useCallback } from "react";
export type Mode = "links" | "cluster";

interface GraphState {
  // --- Data ---
  elements: GraphElement[];

  // --- UI State ---
  mode: Mode;
  showAll: boolean;
  distance: number;
  strength: number;
  selected: string | null;
  activeViolation: Violation | null;
  panelOpen: boolean;
  sequenceRunning: boolean;
  revealedViolations: Violation[];

  // --- Actions ---
  setElements: (elements: GraphElement[]) => void;
  setMode: (mode: Mode) => void;
  setShowAll: (showAll: boolean | ((prev: boolean) => boolean)) => void;
  setDistance: (distance: number) => void;
  setStrength: (strength: number) => void;
  setSelected: (
    selected: string | null | ((prev: string | null) => string | null),
  ) => void;
  setActiveViolation: (
    violation:
      | Violation
      | null
      | ((prev: Violation | null) => Violation | null),
  ) => void;
  setPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSequenceRunning: (running: boolean) => void;
  setRevealedViolations: React.Dispatch<React.SetStateAction<Violation[]>>;
  // 1. Add to GraphState interface (around line 30):
  animateTrigger: number;
  triggerAnimate: () => void;

  // 2. Add to the store implementation (inside create):
  // --- Triggers ---
  reheatTrigger: number;
  triggerReheat: () => void;
}

export const useGraphStore = create<GraphState>()(
  persist(
    (set) => ({
      // Default Data
      elements: [],

      // Default UI State
      mode: "links",
      showAll: true,
      distance: 220,
      strength: 25,
      selected: null,
      activeViolation: null,
      panelOpen: true,
      sequenceRunning: false,
      revealedViolations: [],
      reheatTrigger: 0,

      // Action Implementations
      setElements: (elements) => set({ elements }),
      setMode: (mode) => set({ mode }),
      setShowAll: (showAll) =>
        set((state) => ({
          showAll:
            typeof showAll === "function" ? showAll(state.showAll) : showAll,
        })),
      setDistance: (distance) => set({ distance }),
      setStrength: (strength) => set({ strength }),
      setSelected: (selected) =>
        set((state) => ({
          selected:
            typeof selected === "function"
              ? selected(state.selected)
              : selected,
        })),
      setActiveViolation: (activeViolation) =>
        set((state) => ({
          activeViolation:
            typeof activeViolation === "function"
              ? activeViolation(state.activeViolation)
              : activeViolation,
        })),
      setPanelOpen: (panelOpen) =>
        set((state) => ({
          panelOpen:
            typeof panelOpen === "function"
              ? panelOpen(state.panelOpen)
              : panelOpen,
        })),
      setSequenceRunning: (sequenceRunning) => set({ sequenceRunning }),
      setRevealedViolations: (action) =>
        set((state) => ({
          revealedViolations:
            typeof action === "function"
              ? action(state.revealedViolations)
              : action,
        })),
      triggerReheat: () =>
        set((state) => ({ reheatTrigger: state.reheatTrigger + 1 })),
      animateTrigger: 0,
      triggerAnimate: () =>
        set((state) => ({ animateTrigger: state.animateTrigger + 1 })),
    }),
    {
      name: "graph-store",
      partialize: (state) => ({
        // We are now persisting elements alongside the UI preferences
        elements: state.elements,
        mode: state.mode,
        showAll: state.showAll,
        distance: state.distance,
        strength: state.strength,
        panelOpen: state.panelOpen,
      }),
    },
  ),
);
