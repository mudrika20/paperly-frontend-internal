import React, { useState, useContext, useEffect } from "react";
import DualDropZone from "../components/DualDropZone";
import QuestionCard from "../components/QuestionCard";
import MarkingSchemeTable from "../components/MarkingSchemeTable";
import StickyFilters from "../components/StickyFilters";
import { uploadImage, saveQuestions } from "../services/apiHandler";
import { IngestionContext } from "../context/IngestionContext";
import SessionTracker from "../components/SessionTracker";
import { toast } from "react-toastify";
import { BOARDS, DOCUMENT_TYPES, TIER_LEVELS, YEARS } from "../utils/constants";

// 🚀 Helper: Converts Raw File to Base64 String for Python Engine
const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const normalized = result.includes(",") ? result.split(",", 2)[1] : result;
      resolve(normalized);
    };
    reader.onerror = (error) => reject(error);
  });

const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const Dashboard = () => {
  // 🟢 DYNAMIC METADATA FETCHED FROM CONTEXT
  const { board, code, tier, paper, variant, year, documentType } = useContext(IngestionContext);

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState("");
  const [pdfBlobUrl, setPdfBlobUrl] = useState("");
  const [sessionStats, setSessionStats] = useState(() => {
    const raw = localStorage.getItem("sessionUploads");
    if (!raw) return { questionPapers: 0, markingSchemes: 0 };
    try {
      return JSON.parse(raw);
    } catch {
      return { questionPapers: 0, markingSchemes: 0 };
    }
  });

  const revokePdfBlobUrl = (url) => {
    if (url) URL.revokeObjectURL(url);
  };

  useEffect(() => {
    return () => {
      revokePdfBlobUrl(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // 🟢 Handle Upload (Paste / Drop)
  const handleFileUpload = async (file) => {
    if (!board || !year || !documentType || !tier) {
      toast.warn("Please select Board, Tier, Year, and Document Type before uploading.");
      return;
    }
    if (loading) return;

    let pdfProcessingToastId = null;
    try {
      setLoading(true);
      if ((file.type || "").toLowerCase() === "application/pdf") {
        pdfProcessingToastId = toast.info(
          "PDF Detected: Extracting via AI in safe batches to avoid limits. This takes ~1 minute per 10 pages. Please do not close the tab.",
          { autoClose: false, closeOnClick: false }
        );
      } else {
        toast.info("Upload started. AI is extracting...");
      }

      // 1. Convert to Base64
      const base64String = await toBase64(file);
      setSourceImageDataUrl(`data:${file.type || "image/png"};base64,${base64String}`);
      if ((file.type || "").toLowerCase() === "application/pdf") {
        const nextBlobUrl = URL.createObjectURL(file);
        setPdfBlobUrl((prev) => {
          revokePdfBlobUrl(prev);
          return nextBlobUrl;
        });
      } else {
        setPdfBlobUrl((prev) => {
          revokePdfBlobUrl(prev);
          return "";
        });
      }

      // 2. Prepare Dynamic Metadata from StickyFilters
      const metadata = {
        board: board,
        subject_code: code,
        tier_level: tier,       
        paper_number: paper,    
        calculator_allowed: paper === "2" || paper === "4" ? true : false, // Smart logic for IGCSE
        variant: variant,
        year,
        document_type: documentType
      };

      // 3. Send Base64 & Metadata to Backend
      const data = await uploadImage(base64String, metadata, file.type || "image/png");
      setQuestions(data || []);
      if (pdfProcessingToastId) {
        toast.dismiss(pdfProcessingToastId);
      }
      toast.success(`Successfully extracted ${(data || []).length} questions!`);
    } catch (err) {
      console.error(err);
      if (pdfProcessingToastId) {
        toast.dismiss(pdfProcessingToastId);
      }
      const stageLabel = err?.stage ? `${String(err.stage).toUpperCase()} Failed` : "Network Error";
      toast.error(`${stageLabel}: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const hasValidBulkSaveFilters = () => {
    const boardIsValid = BOARDS.includes(board) && !String(board).toLowerCase().includes("select");
    const tierIsValid = TIER_LEVELS.includes(tier) && !String(tier).toLowerCase().includes("select");
    const docTypeIsValid =
      DOCUMENT_TYPES.includes(documentType) &&
      !String(documentType).toLowerCase().includes("select");
    const yearIsValid = YEARS.includes(String(year)) && !String(year).toLowerCase().includes("select");

    return boardIsValid && tierIsValid && docTypeIsValid && yearIsValid;
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
  const handleBulkSave = async () => {
    if (!questions.length) return;
    if (!hasValidBulkSaveFilters()) {
      toast.error(
        <strong>
          Cannot Save: Please ensure Board, Tier, and Document Type are selected.
        </strong>
      );
      return;
    }

    try {
      setSaving(true);

      const normalizedQuestions = questions.map((question) => ({
        ...question,
        diagram_images_base64: Array.isArray(question.diagram_images_base64)
          ? question.diagram_images_base64
          : (question.diagram_image_base64 ? [question.diagram_image_base64] : []),
        diagram_image_base64: undefined,
        board,
        subject_code: code || question.subject_code || "",
        tier_level: tier,
        paper_number:
          paper !== undefined && paper !== null && paper !== ""
            ? Number(paper)
            : question.paper_number,
        variant: variant ?? question.variant ?? "",
        year:
          year !== undefined && year !== null && year !== ""
            ? Number(year)
            : question.year,
        document_type: documentType,
        calculator_allowed:
          paper === "2" || paper === "4"
            ? true
            : question.calculator_allowed ?? false,
      }));

      const CHUNK_SIZE = 5;
      const questionChunks = chunkArray(normalizedQuestions, CHUNK_SIZE);
      const totalChunks = questionChunks.length;
      let totalSavedCount = 0;

      toast.info("Starting bulk save in batches...");
      const progressToastId = toast.loading(`Saving batch 1 of ${totalChunks}...`);

      let currentBatch = 0;
      for (const chunk of questionChunks) {
        currentBatch += 1;
        toast.update(progressToastId, {
          render: `Saving batch ${currentBatch} of ${totalChunks}...`,
          isLoading: true,
        });
        try {
          await saveQuestions(chunk);
        } catch (error) {
          toast.update(progressToastId, {
            render: `Failed at batch ${currentBatch} of ${totalChunks}.`,
            type: "error",
            isLoading: false,
            autoClose: 3500,
          });
          throw error;
        }
        totalSavedCount += chunk.length;
      }

      toast.update(progressToastId, {
        render: "All questions successfully saved!",
        type: "success",
        isLoading: false,
        autoClose: 2500,
      });

      const nextStats = {
        questionPapers:
          sessionStats.questionPapers +
          (documentType === "Question Paper" ? totalSavedCount : 0),
        markingSchemes:
          sessionStats.markingSchemes +
          (documentType === "Marking Scheme" ? totalSavedCount : 0),
      };
      localStorage.setItem("sessionUploads", JSON.stringify(nextStats));
      setSessionStats(nextStats);
      setQuestions([]); // reset UI
      setSourceImageDataUrl("");
      setPdfBlobUrl((prev) => {
        revokePdfBlobUrl(prev);
        return "";
      });
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save data.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      {/* Header */}
      <div
        className={`mx-auto max-w-7xl space-y-4 ${
          saving ? "pointer-events-none select-none opacity-80" : ""
        }`}
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-lg font-bold sm:text-2xl">Paperly Ingestion Dashboard</h1>
          <StickyFilters />
        </div>

        <SessionTracker stats={sessionStats} />

        {/* Upload Zone */}
        <DualDropZone onFileUpload={handleFileUpload} disabled={loading || saving} loading={loading} />

        {/* Questions List */}
        <div className="space-y-4">
          {documentType === "Marking Scheme" ? (
            <MarkingSchemeTable
              data={questions}
              onSave={handleBulkSave}
              saving={saving}
              disabled={loading || !hasValidBulkSaveFilters()}
            />
          ) : (
            questions.map((q, index) => (
              <QuestionCard
                key={index}
                data={q}
                onChange={(updated) => handleQuestionChange(index, updated)}
                sourceImageDataUrl={sourceImageDataUrl}
                pdfBlobUrl={pdfBlobUrl}
              />
            ))
          )}
        </div>

        {/* Empty State */}
        {!loading && questions.length === 0 && (
          <p className="mt-6 text-center text-gray-500">
            No questions yet. Paste or upload an image or PDF.
          </p>
        )}

        {/* Submit Button */}
        {questions.length > 0 && documentType !== "Marking Scheme" && (
          <div className="mt-6 text-center">
            <button
              onClick={handleBulkSave}
              disabled={loading || saving || !hasValidBulkSaveFilters()}
              className="rounded-xl bg-emerald-600 px-6 py-2 text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Approve All & Bulk Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;