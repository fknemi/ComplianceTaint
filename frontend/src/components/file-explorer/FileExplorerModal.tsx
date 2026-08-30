import React, { useState } from "react";

// Mock Data
const MOCK_FILES = [
  { id: 1, name: "project-proposal.pdf", type: "file" },
  { id: 2, name: "Assets", type: "folder" },
  { id: 3, name: "index.html", type: "file" },
  { id: 4, name: "styles.css", type: "file" },
  { id: 5, name: "Scripts", type: "folder" },
];

export default function FileExplorerModal({ onClose }) {
  const [currentPath, setCurrentPath] = useState("Home / Documents / Project");
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl h-[600px] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            {/* Mock Window Controls */}
            <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600" />
            <div className="w-3.5 h-3.5 rounded-full bg-yellow-400" />
            <div className="w-3.5 h-3.5 rounded-full bg-green-500" />
          </div>
          <div className="flex-1 px-8">
            <div className="bg-white px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-600 text-center mx-auto max-w-md">
              {currentPath}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-black font-medium text-sm">
            Done
          </button>
        </div>

        {/* Explorer Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar */}
          <div className="w-48 bg-gray-50 border-r border-gray-200 p-4 flex flex-col gap-1">
            <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Favorites</div>
            {['Desktop', 'Documents', 'Downloads', 'Images'].map((item) => (
              <button key={item} className="text-left px-3 py-1.5 rounded-md hover:bg-gray-200 text-sm text-gray-700 font-medium transition-colors">
                {item}
              </button>
            ))}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 bg-white overflow-y-auto">
            <div className="grid grid-cols-4 gap-6">
              {MOCK_FILES.map((item) => (
                <div 
                  key={item.id} 
                  className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-blue-50 cursor-pointer group transition-colors"
                >
                  {item.type === "folder" ? (
                    <svg className="w-16 h-16 text-blue-400 group-hover:text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" />
                    </svg>
                  ) : (
                    <svg className="w-16 h-16 text-gray-400 group-hover:text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM13 9V3.5L18.5 9H13Z" />
                    </svg>
                  )}
                  <span className="text-sm text-gray-700 font-medium text-center truncate w-full">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
