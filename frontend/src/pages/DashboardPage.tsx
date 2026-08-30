import LeftSidebar from "@/components/layout/LeftSidebar";
import RightSidebar from "@/components/layout/RightSidebar";
import Sidebar from "@/components/layout/Sidebar";
import { useEffect, useState } from "react";
import SanitizerModal from "@/components/sanitizer/SanitizerModal";
import FileExplorerModal from "@/components/file-explorer/FileExplorerModal";

// 1. Import your GraphPage
import GraphPage from "@/pages/GraphPage";

function DashboardPage() {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const closeModal = () => {
    setActiveModal(null);
    window.history.replaceState(null, "", window.location.pathname);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === "#sanitize") {
        setActiveModal("sanitize");
      } else if (hash === "#explore") {
        setActiveModal("explore");
      } else {
        setActiveModal(null);
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <>
      <Sidebar leftSidebar={<LeftSidebar onOpenModal={setActiveModal} />}>
        {/* 2. Render GraphPage here so it sits in the center between the sidebars */}
        <div className="flex-1 h-full relative overflow-hidden bg-[#fafaf8]">
          <GraphPage />
        </div>
      </Sidebar>

      {activeModal === "sanitize" && <SanitizerModal onClose={closeModal} />}
      {activeModal === "explore" && <FileExplorerModal onClose={closeModal} />}
    </>
  );
}

export default DashboardPage;
