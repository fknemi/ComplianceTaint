import LeftSidebar from "@/components/layout/LeftSidebar";
import RightSidebar from "@/components/layout/RightSidebar";
import Sidebar from "@/components/layout/Sidebar";
import { useEffect, useState } from "react";
import SanitizerModal from "@/components/sanitizer/SanitizerModal";
import FileExplorerModal from "@/components/file-explorer/FileExplorerModal";

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
      <Sidebar
        leftSidebar={<LeftSidebar onOpenModal={setActiveModal} />}
        rightSidebar={<RightSidebar />}
      />
      {activeModal === "sanitize" && <SanitizerModal onClose={closeModal} />}
      {activeModal === "explore" && <FileExplorerModal onClose={closeModal} />}
    </>
  );
}

export default DashboardPage;
