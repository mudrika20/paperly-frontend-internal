import React from "react";

const DualDropZone = ({ onFileUpload }) => {
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileUpload(file);
  };

  const handlePaste = (e) => {
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
      className="border-2 border-dashed border-gray-400 p-10 text-center rounded-xl bg-white"
    >
      <p className="text-gray-600">
        Drag & drop or press <b>Ctrl+V</b> to paste image
      </p>
    </div>
  );
};

export default DualDropZone;