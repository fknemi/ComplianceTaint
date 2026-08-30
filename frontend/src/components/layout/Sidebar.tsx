import { useSidebarStore } from "@/stores/useSidebarStore";

export default function SidebarLayout({ leftSidebar, rightSidebar, children }) {
  const {
    isLeftCollapsed,
    isRightCollapsed,
    isLeftHidden,
    isRightHidden,
    toggleLeftCollapse,
    toggleRightCollapse,
  } = useSidebarStore();

  return (
    <div className="flex h-screen w-full font-sans bg-white text-gray-800 overflow-hidden">
      {!isLeftHidden && (
        <div
          className={`relative flex-shrink-0 transition-all duration-300 ease-in-out border-2 overflow-hidden bg-white ${
            isLeftCollapsed
              ? "w-12 h-[140px] mt-10 border-[#B9B9B9] rounded-tr-lg rounded-br-lg"
              : "w-96 h-[calc(100vh-5rem)] my-10 border-transparent"
          }`}
        >
          {/* Collapsed State */}
          <div
            onClick={toggleLeftCollapse}
            className={`absolute inset-0 flex flex-col justify-center items-center cursor-pointer transition-all duration-300 ease-in-out ${
              isLeftCollapsed
                ? "opacity-100 z-10 delay-100"
                : "opacity-0 -translate-x-8 pointer-events-none"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={24}
              height={24}
              viewBox="0 0 24 24"
              style={{
                fill: "rgba(0, 0, 0, 1)",
              }}
            >
              <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm-1.293 15.707-1.414-1.414L13.586 12 9.293 7.707l1.414-1.414L16.414 12l-5.707 5.707z" />
            </svg>
            <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap tracking-widest font-[800] mt-4">
              Settings
            </span>
          </div>

          {/* Expanded State */}
          <div
            className={`absolute inset-0 w-fit h-full overflow-y-auto transition-all duration-300 ease-in-out ${
              isLeftCollapsed
                ? "opacity-0 translate-x-8 pointer-events-none"
                : "opacity-100 z-10 delay-100"
            }`}
          >
            {leftSidebar}
          </div>
        </div>
      )}

      <div className="flex-1 p-8 bg-white overflow-y-auto">{children}</div>
    </div>
  );
}
