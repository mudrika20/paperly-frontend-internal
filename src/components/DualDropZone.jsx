import React from "react";

const DualDropZone = ({ onFileUpload, disabled = false, loading = false }) => {
  const handleDrop = (e) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFileUpload(file);
  };

  const handlePaste = (e) => {
    if (disabled) return;
    const items = e.clipboardData.items;
    for (let item of items) {
      if (item.type.includes("image")) {
        const file = item.getAsFile();
        onFileUpload(file);
      }
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={handlePaste}
      className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
        disabled
          ? "cursor-not-allowed border-gray-300 bg-gray-100 opacity-70"
          : "cursor-pointer border-indigo-300 bg-white hover:border-indigo-500"
      }`}
    >
      {loading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-medium text-gray-700">Processing upload...</p>
        </div>
      ) : (
        <>
          <p className="text-gray-600">
            Drag & drop, paste, or choose an Image or PDF
          </p>
          <label className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
            Select Image or PDF
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={disabled}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileUpload(file);
              }}
            />
          </label>
        </>
      )}
    </div>
  );
};

export default DualDropZone;