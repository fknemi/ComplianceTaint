import React, { useState, useEffect, useMemo } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useListFiles } from "@/api/files";
import { useFileContent } from "@/api/file";

// --- Lightweight Custom Markdown & Syntax Highlighter ---
function parseAndHighlight(text: string) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return <h2 key={i} className="text-lg font-bold text-gray-800 mt-5 mb-2">{line.slice(3)}</h2>;
    }
    if (line.startsWith("# ")) {
      return <h1 key={i} className="text-xl font-bold text-gray-900 mt-5 mb-2">{line.slice(2)}</h1>;
    }
    
    // Parse inline code snippets (text wrapped in `backticks`)
    const parts = line.split(/`([^`]+)`/g);
    const formattedLine = parts.map((part, j) => 
      j % 2 === 1 ? (
        <code key={j} className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-gray-200">
          {part}
        </code>
      ) : (
        <span key={j}>{part}</span>
      )
    );

    if (line.startsWith("- ")) {
      return <li key={i} className="ml-5 list-disc text-gray-600 text-sm mb-1.5 leading-relaxed">{formattedLine.slice(1)}</li>;
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    
    return <p key={i} className="text-gray-600 text-sm mb-2 leading-relaxed">{formattedLine}</p>;
  });
}

export default function FileExplorerModal({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore();
  
  // API Hooks
  const { mutate: fetchFiles, data: filesData, isPending: isLoadingFiles, isError: isFilesError } = useListFiles();
  const { mutate: fetchContent, data: fileContent, isPending: isLoadingContent } = useFileContent();

  // State
  const [currentDir, setCurrentDir] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Initial Fetch
  useEffect(() => {
    if (settings.projectId) {
      fetchFiles({
        projectId: settings.projectId,
        branch: settings.branch,
        apiKey: settings.apiKey,
      });
    }
  }, [settings.projectId, settings.branch, settings.apiKey, fetchFiles]);

  // Compute folder structure based on flat file paths
  const currentItems = useMemo(() => {
    if (!filesData?.files) return [];
    
    const contents = new Map();
    filesData.files.forEach((f: string) => {
      // Check if file sits inside the current directory
      if (currentDir === "" || f.startsWith(currentDir + "/")) {
        const relativePath = currentDir === "" ? f : f.slice(currentDir.length + 1);
        const parts = relativePath.split("/");
        const isFolder = parts.length > 1;
        const name = parts[0];
        
        if (!contents.has(name)) {
          contents.set(name, { 
            name, 
            type: isFolder ? "folder" : "file", 
            fullPath: currentDir === "" ? name : `${currentDir}/${name}` 
          });
        }
      }
    });
    
    // Sort folders first, then files alphabetically
    return Array.from(contents.values()).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "folder" ? -1 : 1;
    });
  }, [filesData, currentDir]);

  // Handlers
  const handleItemClick = (item: any) => {
    if (item.type === "folder") {
      setCurrentDir(item.fullPath);
    } else {
      setSelectedFile(item.fullPath);
      fetchContent({
        projectId: settings.projectId,
        branch: settings.branch,
        apiKey: settings.apiKey,
        path: item.fullPath,
      });
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    setSelectedFile(null); // Exit file view
    if (index === -1) {
      setCurrentDir("");
    } else {
      const parts = currentDir.split("/");
      setCurrentDir(parts.slice(0, index + 1).join("/"));
    }
  };

  // Build breadcrumbs text
  const breadcrumbParts = currentDir === "" ? [] : currentDir.split("/");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-5xl h-[700px] rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-200">
        
        {/* Window Chrome / Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50/80">
          <div className="flex gap-2">
            <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors" />
            <div className="w-3.5 h-3.5 rounded-full bg-yellow-400" />
            <div className="w-3.5 h-3.5 rounded-full bg-green-500" />
          </div>
          
          {/* Interactive Breadcrumbs */}
          <div className="flex-1 px-8">
            <div className="bg-white px-4 py-1.5 rounded-md border border-gray-200 text-sm text-gray-600 flex items-center justify-center gap-2 mx-auto max-w-xl shadow-sm overflow-hidden whitespace-nowrap">
              <button onClick={() => handleBreadcrumbClick(-1)} className="hover:text-blue-600 font-medium transition-colors">
                Root
              </button>
              {breadcrumbParts.map((part, idx) => (
                <React.Fragment key={idx}>
                  <span className="text-gray-300">/</span>
                  <button 
                    onClick={() => handleBreadcrumbClick(idx)}
                    className="hover:text-blue-600 font-medium transition-colors"
                  >
                    {part}
                  </button>
                </React.Fragment>
              ))}
              {selectedFile && (
                <>
                  <span className="text-gray-300">/</span>
                  <span className="text-gray-800 font-semibold truncate">{selectedFile.split('/').pop()}</span>
                </>
              )}
            </div>
          </div>
          
          <button onClick={onClose} className="text-gray-500 hover:text-black font-medium text-sm transition-colors">
            Done
          </button>
        </div>

        {/* Explorer Body */}
        <div className="flex flex-1 overflow-hidden relative">
          
          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto bg-white p-6">
            
            {/* Loading / Error States */}
            {isLoadingFiles && !selectedFile && (
              <div className="flex items-center justify-center h-full text-gray-400 gap-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Loading repository...
              </div>
            )}
            {isFilesError && (
              <div className="flex items-center justify-center h-full text-red-500">
                Failed to load file tree. Check your Project ID.
              </div>
            )}

            {/* Grid View (When looking at a folder) */}
            {!selectedFile && !isLoadingFiles && !isFilesError && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-6">
                {currentItems.map((item) => (
                  <button 
                    key={item.fullPath} 
                    onClick={() => handleItemClick(item)}
                    className="flex flex-col items-center gap-3 p-3 rounded-xl hover:bg-blue-50 focus:bg-blue-50 outline-none cursor-pointer group transition-all"
                  >
                    {item.type === "folder" ? (
                      <svg className="w-16 h-16 text-blue-400 group-hover:text-blue-500 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" />
                      </svg>
                    ) : (
                      <svg className="w-16 h-16 text-gray-400 group-hover:text-gray-600 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6C4.9 2 4.01 2.9 4.01 4L4 20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM13 9V3.5L18.5 9H13Z" />
                      </svg>
                    )}
                    <span className="text-xs text-gray-700 font-medium text-center break-words w-full line-clamp-2">
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* File Details View (When a file is selected) */}
            {selectedFile && (
              <div className="max-w-4xl mx-auto pb-10">
                {isLoadingContent ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Analyzing file AST and extracting symbols...
                  </div>
                ) : fileContent ? (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* Header */}
                    <div className="border-b border-gray-200 pb-4 mb-6">
                      <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">{selectedFile.split('/').pop()}</h1>
                      <p className="text-sm text-gray-400 mt-1">{selectedFile}</p>
                    </div>

                    {/* Parsed Markdown Summary */}
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 mb-8">
                      {parseAndHighlight(fileContent.summary)}
                    </div>

                    {/* Extracted Key Symbols (AST Nodes) */}
                    {fileContent.key_symbols && fileContent.key_symbols.length > 0 && (
                      <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Exported Symbols</h3>
                        <div className="flex flex-wrap gap-2.5">
                          {fileContent.key_symbols.map((symbol: any, idx: number) => (
                            <div key={idx} className="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide mr-2">
                                {symbol.kind}
                              </span>
                              <span className="font-mono text-sm text-gray-700 font-medium">
                                {symbol.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-20">No content available for this file.</div>
                )}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
