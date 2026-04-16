import React, { useState, useContext } from "react";
import DualDropZone from "../components/DualDropZone";
import QuestionCard from "../components/QuestionCard";
import StickyFilters from "../components/StickyFilters";
import { uploadImage, saveQuestions } from "../services/apiHandler";
import { IngestionContext } from "../context/IngestionContext";

const Dashboard = () => {
  const { board, code } = useContext(IngestionContext);

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // 🟢 Handle Upload (Paste / Drop)
  const handleFileUpload = async (file) => {
    try {
      setLoading(true);
      setMessage("");

      const data = await uploadImage(file); // API call
      setQuestions(data || []);
    } catch (err) {
      console.error(err);
      setMessage("❌ Failed to process image");
    } finally {
      setLoading(false);
    }
  };

  // 🟡 Handle Inline Edit Update
  const handleQuestionChange = (index, updatedData) => {
    const updatedQuestions = [...questions];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      ...updatedData,
    };
    setQuestions(updatedQuestions);
  };

  // 🔴 Bulk Save
  const handleSubmit = async () => {
    if (!questions.length) return;

    try {
      setSaving(true);
      setMessage("");

      // Inject metadata
      const payload = questions.map((q) => ({
        ...q,
        board,
        code,
      }));

      await saveQuestions(payload);

      setMessage("✅ Successfully Saved!");
      setQuestions([]); // reset UI
    } catch (err) {
      console.error(err);
      setMessage("❌ Failed to save data");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">📄 Paperly Ingestion Dashboard</h1>
        <StickyFilters />
      </div>

      {/* Upload Zone */}
      <DualDropZone onFileUpload={handleFileUpload} />

      {/* Loading State */}
      {loading && (
        <p className="mt-4 text-blue-500">Processing image...</p>
      )}

      {/* Questions List */}
      <div className="mt-6 space-y-4">
        {questions.map((q, index) => (
          <QuestionCard
            key={index}
            data={q}
            onChange={(updated) =>
              handleQuestionChange(index, updated)
            }
          />
        ))}
      </div>

      {/* Empty State */}
      {!loading && questions.length === 0 && (
        <p className="mt-6 text-gray-500 text-center">
          No questions yet. Paste or upload an image.
        </p>
      )}

      {/* Submit Button */}
      {questions.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-green-600 text-white px-6 py-2 rounded-xl shadow hover:bg-green-700"
          >
            {saving ? "Saving..." : "Approve All & Bulk Save"}
          </button>
        </div>
      )}

      {/* Notification */}
      {message && (
        <div className="mt-4 text-center font-medium">
          {message}
        </div>
      )}
    </div>
  );
};

export default Dashboard;