import { useSidebarStore } from "@/stores/useSidebarStore";

export default function SidebarLayout({ leftSidebar, rightSidebar, children }) {
  // Consume the store
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
      {/* Left Sidebar */}
      {!isLeftHidden && (
        <div
          className={`flex flex-col transition-[width] duration-300 ease-in-out  border-2 border-green-500 ${
            isLeftCollapsed
              ? "w-12 h-fit py-4 mt-10  border-[#B9B9B9] border-2  rounded-tr-lg rounded-br-lg"
              : "w-fit my-10"
          }`}
        >
          <button
            onClick={toggleLeftCollapse}
            className={`w-fit border py-4 flex items-center justify-center cursor-pointer font-bold whitespace-nowrap ${toggleLeftCollapse ? "hidden" : ""}`}
          >
            {isLeftCollapsed ? (
              <svg
                width="24px"
                height="24px"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                color="#000000"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12C1.25 6.06294 6.06294 1.25 12 1.25ZM11.5303 7.96967C11.2374 7.67678 10.7626 7.67678 10.4697 7.96967C10.1768 8.26256 10.1768 8.73744 10.4697 9.03033L13.4393 12L10.4697 14.9697C10.1768 15.2626 10.1768 15.7374 10.4697 16.0303C10.7626 16.3232 11.2374 16.3232 11.5303 16.0303L15.0303 12.5303C15.3232 12.2374 15.3232 11.7626 15.0303 11.4697L11.5303 7.96967Z"
                  fill="#000000"
                />
              </svg>
            ) : null}
          </button>

          <div className="flex-1 border flex h-full w-full overflow-hidden">
            {isLeftCollapsed ? (
              <div className="w-full flex justify-center items-center">
                <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap tracking-widest font-[800]">
                  Settings
                </span>
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto">{leftSidebar}</div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 p-8 bg-white overflow-y-auto">{children}</div>
    </div>
  );
}
