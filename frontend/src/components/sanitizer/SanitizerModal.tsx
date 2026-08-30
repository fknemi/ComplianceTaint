import React, { useState } from "react";

export default function SanitizerModal({ onClose }) {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [options, setOptions] = useState({
    stripHtml: true,
    trimWhitespace: true,
  });

  const handleSanitize = () => {
    let result = inputText;
    
    if (options.stripHtml) {
      // Basic regex to remove HTML tags
      result = result.replace(/<[^>]*>?/gm, "");
    }
    
    if (options.trimWhitespace) {
      // Remove leading/trailing spaces and collapse multiple spaces into one
      result = result.trim().replace(/\s+/g, " ");
    }
    
    setOutputText(result);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800">Text Sanitizer</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input 
                type="checkbox" 
                checked={options.stripHtml} 
                onChange={(e) => setOptions({...options, stripHtml: e.target.checked})}
                className="rounded text-blue-600"
              />
              Strip HTML Tags
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input 
                type="checkbox" 
                checked={options.trimWhitespace} 
                onChange={(e) => setOptions({...options, trimWhitespace: e.target.checked})}
                className="rounded text-blue-600"
              />
              Trim Extra Whitespace
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Raw Input</label>
              <textarea 
                className="w-full h-48 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Paste text here..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Sanitized Output</label>
              <textarea 
                readOnly
                className="w-full h-48 p-3 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none resize-none"
                placeholder="Result will appear here..."
                value={outputText}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={handleSanitize}
            className="px-6 py-2 bg-[#111111] text-white hover:bg-black rounded-lg transition-colors font-medium shadow-sm"
          >
            Sanitize Text
          </button>
        </div>
      </div>
    </div>
  );
}
