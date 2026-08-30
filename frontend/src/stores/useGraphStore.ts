import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GraphElement } from "@/types/graph";

interface GraphStore {
  elements: GraphElement[];
  selectedNodeId: string | null;
  setElements: (elements: GraphElement[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  clear: () => void;
}

export const useGraphStore = create<GraphStore>()(
  persist(
    (set) => ({
      elements: [],
      selectedNodeId: null,
      setElements: (elements) => set({ elements }),
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),
      clear: () => set({ elements: [], selectedNodeId: null }),
    }),
    {
      name: "graph-storage",
      partialize: (state) => ({ elements: state.elements }),
    },
  ),
);
