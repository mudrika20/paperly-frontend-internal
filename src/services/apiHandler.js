const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const uploadImage = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Upload failed");

  return res.json();
};

export const saveQuestions = async (data) => {
  const res = await fetch(`${BASE_URL}/save-questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) throw new Error("Save failed");

  return res.json();
};