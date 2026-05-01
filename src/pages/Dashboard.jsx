import React, { useState, useEffect, useRef } from "react";
import DualDropZone from "../components/DualDropZone";
import QuestionCard from "../components/QuestionCard";
import MarkingSchemeCard from "../components/MarkingSchemeCard";
import MetadataVerificationCard from "../components/MetadataVerificationCard";
import SessionTracker from "../components/SessionTracker";
import ManualPairingModal from "../components/ManualPairingModal";
import { uploadImage, saveQuestions, fetchQuestionCount } from "../services/apiHandler";
import { toast } from "react-toastify";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = reject;
  });

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Sanitizes diagram URLs to ensure they are a flat array of valid strings
const sanitizeDiagramUrls = (diagramUrls) => {
  // Return empty array if null/undefined
  if (!diagramUrls) return [];
  
  // Handle single string value
  if (typeof diagramUrls === 'string') {
    // If it's JSON-like, try to parse it
    if (diagramUrls.trim().startsWith('[') && diagramUrls.trim().endsWith(']')) {
      try {
        const parsed = JSON.parse(diagramUrls);
        return sanitizeDiagramUrls(parsed); // Recursive call with parsed value
      } catch (e) {
        // If parsing fails, treat as a simple string
        return diagramUrls.trim() ? [diagramUrls.trim()] : [];
      }
    }
    return diagramUrls.trim() ? [diagramUrls.trim()] : [];
  }
  
  // Not an array, return empty array
  if (!Array.isArray(diagramUrls)) return [];
  
  // Recursively flatten nested arrays and filter out invalid values
  const flattenDeep = (arr) => {
    return arr.reduce((acc, val) => 
      Array.isArray(val) 
        ? acc.concat(flattenDeep(val)) 
        : acc.concat(typeof val === 'string' && val.trim() !== '' ? val : []), 
      []
    );
  };

  const flatUrls = flattenDeep(diagramUrls);
  
  // Filter out any non-strings, empty strings, or null/undefined
  return flatUrls.filter(url => {
    return typeof url === 'string' && url.trim() !== '';
  });
};

const unpackResponse = (response) => {
  const payload = response?.data?.data ?? response?.data ?? response;

  let questions = [];
  let meta = {};

  if (Array.isArray(payload)) {
    questions = payload;
  } else if (payload?.questions_array) {
    questions = Array.isArray(payload.questions_array) ? payload.questions_array : [];
    meta = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  }

  if (Object.keys(meta).length === 0 && questions.length > 0) {
    const q = questions[0];
    meta = {
      curriculum:  q.curriculum  || q.board        || "",
      subjectCode: q.subjectCode || q.subject_code || "",
      tier:        q.tier        || q.tier_level   || "",
      paperNumber: q.paperNumber || q.paper_number || "",
      session:     q.session     || "",
      year:        q.year        || "",
      program:     q.program     || "",
    };
  }

  // Mark Point Validator for Marking Schemes
  questions = questions.map(q => {
    // Only process marking scheme entries
    if (q.document_type !== "Marking Scheme") return q;
    
    // If method_steps is empty or not an array, try to extract from other fields
    if (!Array.isArray(q.method_steps) || q.method_steps.length === 0) {
      // Create a default empty array
      q.method_steps = [];
      
      // Try to extract mark points from official_marking_scheme_latex if available
      if (q.official_marking_scheme_latex) {
        const msText = q.official_marking_scheme_latex;
        
        // Look for common mark patterns like M1, A1, B1, etc.
        const markRegex = /\b([MAB][1-9]|SC[1-9]|ft|oe|dep)\b/gi;
        const matches = msText.match(markRegex);
        
        if (matches && matches.length > 0) {
          // Create basic method steps from the matches
          const uniqueMatches = [...new Set(matches.map(m => m.toUpperCase()))];
          uniqueMatches.forEach(markType => {
            q.method_steps.push({
              type: markType,
              description: "Mark point extracted from marking scheme"
            });
          });
        }
        
        // If we still have no method steps but have a final answer, add a generic mark
        if (q.method_steps.length === 0 && q.final_answer) {
          q.method_steps.push({
            type: "mark",
            description: "Mark for correct answer"
          });
        }
      }
      
      // If total_marks is available but no method steps, create generic steps
      if (q.method_steps.length === 0 && q.total_marks && q.total_marks > 0) {
        for (let i = 0; i < q.total_marks; i++) {
          q.method_steps.push({
            type: i === q.total_marks - 1 ? "A1" : "M1",
            description: i === q.total_marks - 1 ? "Accuracy mark" : "Method mark"
          });
        }
      }
    }
    
    return q;
  });

  return { questions, meta };
};

// ─── Component ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const [extractionStep, setExtractionStep]         = useState("upload");
  const [extractedMeta, setExtractedMeta]           = useState({});
  const [extractedQuestions, setExtractedQuestions] = useState([]);
  const [documentMode, setDocumentMode]             = useState("Question Paper"); // "Question Paper" | "Marking Scheme"
  const [boardMode, setBoardMode]                   = useState("IGCSE"); // "IGCSE" | "IB"
  
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl]               = useState("");
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState("");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0); // For pagination

  // ── Manual pairing modal state ─────────────────────────────────────────────
  const [isManualPairingModalOpen, setIsManualPairingModalOpen] = useState(false);
  const [selectedUnpairedDoc, setSelectedUnpairedDoc] = useState(null);

  // ── DB-synced counters ────────────────────────────────────────────────────
  const [dbCounts, setDbCounts] = useState({ questionPapers: 0, markingSchemes: 0 });

  const refreshDbCounts = async () => {
    try {
      const counts = await fetchQuestionCount();
      setDbCounts(counts);
    } catch {
      // Silently fail — counts are cosmetic
    }
  };

  // Fetch on mount and every 30 s so the counter stays live across tabs
  useEffect(() => {
    refreshDbCounts();
    const id = setInterval(refreshDbCounts, 30_000);
    return () => clearInterval(id);
  }, []);

  const originalFileRef = useRef(null);

  const revokePdfBlobUrl = (url) => { if (url) URL.revokeObjectURL(url); };
  useEffect(() => () => revokePdfBlobUrl(pdfBlobUrl), [pdfBlobUrl]);

  // ── Upload ────────────────────────────────────────────────────────────────

 const handleFileUpload = async (file) => {
    if (loading) return;
    originalFileRef.current = file;

    // ✅ FIX: Use the user's manually selected documentMode — do NOT auto-detect from filename.
    // Filename pe rely karna unreliable hai (IB ke liye) aur user ki choice ko overwrite kar deta hai.
    const docType = documentMode;

    let pdfToastId = null;
    try {
      setLoading(true);

      if ((file.type || "").toLowerCase() === "application/pdf") {
        pdfToastId = toast.info(
          "PDF detected — extracting via AI (~1 min per 10 pages). Don't close the tab.",
          { autoClose: false, closeOnClick: false }
        );
      } else {
        toast.info("Upload started. AI is extracting…");
      }

      const base64String = await toBase64(file);
      setSourceImageDataUrl(`data:${file.type || "image/png"};base64,${base64String}`);

      if ((file.type || "").toLowerCase() === "application/pdf") {
        const next = URL.createObjectURL(file);
        setPdfBlobUrl((prev) => { revokePdfBlobUrl(prev); return next; });
      } else {
        setPdfBlobUrl((prev) => { revokePdfBlobUrl(prev); return ""; });
      }

      // Metadata uses the manually selected docType and board
      const metadata = { 
        document_type: docType,
        file_name: file.name,
        board: boardMode
      };

      // For IB documents, extract first page separately to help with metadata extraction
      let firstPageBase64 = null;
      if (boardMode === 'IB' && (file.type || "").toLowerCase() === "application/pdf") {
        // For now, we're using the same base64 for the full document and first page
        // In a production environment, you'd extract just the first page
        firstPageBase64 = base64String;
      }

      const response = await uploadImage(base64String, metadata, file.type || "image/png", firstPageBase64);

      const { questions, meta } = unpackResponse(response);

      // Debug: Log the extracted data
      console.log('[Dashboard] Extraction complete:', {
        questionCount: questions.length,
        detectedType: meta?.document_type || questions[0]?.document_type || "Unknown",
        firstQuestion: questions[0],
        metadata: meta,
      });

      // Detect document mode from first question or meta
      const detectedType =
        meta?.document_type ||
        questions[0]?.document_type ||
        docType;
      setDocumentMode(detectedType);

      setExtractedMeta(meta);
      setExtractedQuestions(questions);
      
      if (detectedType === 'Marking Scheme') {
        setExtractionStep("reviewMarkingScheme");
      } else {
        setExtractionStep("verifyMeta");
      }

      if (pdfToastId) toast.dismiss(pdfToastId);

      questions.length === 0
        ? toast.error("Extracted 0 questions — check the console.")
        : toast.success(`Extracted ${questions.length} ${detectedType === "Marking Scheme" ? "marking scheme entries" : "questions"}!`);

    } catch (err) {
      console.error(err);
      if (pdfToastId) toast.dismiss(pdfToastId);
      const label = err?.stage ? `${String(err.stage).toUpperCase()} Failed` : "Network Error";
      toast.error(`${label}: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Redo ──────────────────────────────────────────────────────────────────

  const handleRedoExtraction = async () => {
    const file = originalFileRef.current;
    if (!file) { toast.warn("No file stored — please upload again."); return; }
    setExtractedQuestions([]);
    setExtractedMeta({});
    setExtractionStep("upload");
    await handleFileUpload(file);
  };

  // ── Manual pairing handlers ────────────────────────────────────────────────
  
  const openManualPairingModal = (document) => {
    setSelectedUnpairedDoc(document);
    setIsManualPairingModalOpen(true);
  };
  
  const closeManualPairingModal = () => {
    setIsManualPairingModalOpen(false);
    setSelectedUnpairedDoc(null);
  };
  
  // ── Question edit ─────────────────────────────────────────────────────────

  const handleQuestionChange = (index, updatedData) => {
    setExtractedQuestions((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updatedData };
      return next;
    });
  };

  // ── Metadata approved ─────────────────────────────────────────────────────

  const handleMetadataApprove = (approvedMeta) => {
    setExtractedMeta(approvedMeta);
    setExtractionStep("reviewQuestions");
    toast.success("Metadata approved — reviewing questions.");
  };

  // ── Bulk save ─────────────────────────────────────────────────────────────

  const handleBulkSave = async () => {
    if (!extractedQuestions.length) return;

    try {
      setSaving(true);

      const questionsToSave = extractedQuestions.map((q) => {
        // Properly format diagram_urls to ensure it's an array of strings and not a stringified array
        let formatted = {
          ...q,
          // Overlay verified metadata onto every question
          curriculum:  extractedMeta.curriculum  ?? q.curriculum,
          program:     extractedMeta.program     ?? q.program,
          subjectCode: extractedMeta.subjectCode ?? q.subjectCode,
          tier:        extractedMeta.tier        ?? q.tier,
          paperNumber: extractedMeta.paperNumber ?? q.paperNumber,
          session:     extractedMeta.session     ?? q.session,
          year:        extractedMeta.year        ?? q.year,
          diagram_images_base64: undefined, // stripped — uploaded separately
        };

          // Fix the diagram_urls formatting if it exists
          if (formatted.diagram_urls) {
            // Deep sanitize to handle nested arrays
            formatted.diagram_urls = sanitizeDiagramUrls(formatted.diagram_urls);
            console.log("Sanitized diagram_urls:", formatted.diagram_urls);
          }
        
        return formatted;
      });

      const chunks     = chunkArray(questionsToSave, 5);
      const progressId = toast.loading(`Saving batch 1 of ${chunks.length}…`);
      let saved = 0;

      for (let i = 0; i < chunks.length; i++) {
        toast.update(progressId, { render: `Saving batch ${i + 1} of ${chunks.length}…`, isLoading: true });
        try {
          await saveQuestions(chunks[i]);
        } catch (err) {
          toast.update(progressId, {
            render: `Failed at batch ${i + 1}.`, type: "error", isLoading: false, autoClose: 3500,
          });
          throw err;
        }
        saved += chunks[i].length;
      }

      toast.update(progressId, {
        render: `${saved} ${documentMode === "Marking Scheme" ? "MS entries" : "questions"} saved!`,
        type: "success", isLoading: false, autoClose: 2500,
      });

      // Refresh DB counts immediately after save
      await refreshDbCounts();

      // Reset for next upload
      setExtractedQuestions([]);
      setExtractedMeta({});
      setSourceImageDataUrl("");
      setPdfBlobUrl((prev) => { revokePdfBlobUrl(prev); return ""; });
      setExtractionStep("upload");
      setDocumentMode("Question Paper");
      originalFileRef.current = null;

    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isMarkingScheme = documentMode === "Marking Scheme";

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className={`mx-auto max-w-7xl space-y-4 ${saving ? "pointer-events-none select-none opacity-75" : ""}`}>

        {/* ── Header — no dropdowns ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">
            📚 Paperly Ingestion Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload a Question Paper or Marking Scheme PDF. The AI will extract and structure everything automatically.
          </p>
        </div>

        {/* ── Live DB counters ── */}
        <SessionTracker stats={dbCounts} />

        {/* ── Step 1: Upload ── */}
        {extractionStep === "upload" && (
          <>
            {/* Document Type & Board Selectors */}
            <div className="space-y-4">
              <div className="flex gap-4">
                <button 
                  className={`px-4 py-2 rounded-lg font-semibold transition ${documentMode === 'Question Paper' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                  onClick={() => setDocumentMode('Question Paper')}
                  disabled={loading || saving}
                >
                  📝 Question Paper
                </button>
                <button 
                  className={`px-4 py-2 rounded-lg font-semibold transition ${documentMode === 'Marking Scheme' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                  onClick={() => setDocumentMode('Marking Scheme')}
                  disabled={loading || saving}
                >
                  📋 Marking Scheme
                </button>
              </div>
              
              {/* IMPORTANT: Board Selector */}
              <div className="flex flex-col">
                <label className="mb-2 font-semibold text-gray-700">Select Board:</label>
                <div className="flex gap-4">
                  <button 
                    className={`px-4 py-2 rounded-lg font-semibold transition ${boardMode === 'IGCSE' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                    onClick={() => setBoardMode('IGCSE')}
                    disabled={loading || saving}
                  >
                    IGCSE
                  </button>
                  <button 
                    className={`px-4 py-2 rounded-lg font-semibold transition ${boardMode === 'IB' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                    onClick={() => setBoardMode('IB')}
                    disabled={loading || saving}
                  >
                    IB
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Must be selected BEFORE uploading. This determines how the document will be processed.
                </p>
              </div>
            </div>

            <DualDropZone
              onFileUpload={handleFileUpload}
              disabled={loading || saving}
              loading={loading}
            />
            {!loading && (
              <p className="mt-4 text-center text-sm text-slate-400">
                Drop a QP or MS PDF — the AI detects the document type automatically.
              </p>
            )}
          </>
        )}

        {/* ── Step 2: Verify metadata ── */}
        {extractionStep === "verifyMeta" && (
          <MetadataVerificationCard
            extractedMeta={extractedMeta}
            extractedQuestions={extractedQuestions}
            onApprove={handleMetadataApprove}
            onRedo={handleRedoExtraction}
            loading={loading}
            saving={saving}
          />
        )}

        {/* ── Step 3: Review & save ── */}
        {(extractionStep === "reviewQuestions" || extractionStep === "reviewMarkingScheme") && (
          <div className="space-y-4">

            {/* Mode badge */}
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                isMarkingScheme
                  ? "bg-amber-100 text-amber-800"
                  : "bg-indigo-100 text-indigo-800"
              }`}>
                {isMarkingScheme ? "📋 Marking Scheme" : "📝 Question Paper"} — {extractedQuestions.length} items
              </span>
            </div>

            {/* Marking Scheme → read-only table (full array) */}
              {isMarkingScheme ? (
                <>
                  <MarkingSchemeCard 
                    allEntries={extractedQuestions} 
                    onEntryChange={(index, updatedEntry) => handleQuestionChange(index, updatedEntry)}
                  />
                  {extractedQuestions.length > 0 && (
                    <div className="mt-6 flex flex-col items-center gap-3">
                      <button
                        onClick={handleBulkSave}
                        disabled={loading || saving}
                        className="rounded-xl bg-emerald-600 px-8 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? "Saving…" : `Approve All & Save ${extractedQuestions.length} MS Entries`}
                      </button>
                      
                      {/* Manual override button */}
                      <button
                        onClick={() => openManualPairingModal({
                          id: extractedQuestions[0]?._id,
                          documentType: "Marking Scheme",
                          paper_reference_key: extractedMeta.paper_reference_key || extractedQuestions[0]?.paper_reference_key
                        })}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Need to manually pair? Click here
                      </button>
                    </div>
                  )}
              </>
            ) : (
              /* Question Paper → stepper/pagination with editable cards */
              <>
                {extractedQuestions.length === 0 && (
                  <p className="text-center text-slate-500">No questions to display.</p>
                )}
                
                {extractedQuestions.length > 0 && (
                  <>
                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm">
                      <button
                        onClick={() => setCurrentQuestionIndex(prevIndex => Math.max(0, prevIndex - 1))}
                        disabled={currentQuestionIndex <= 0 || loading || saving}
                        className="px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ← Previous
                      </button>
                      
                      <div className="text-sm font-medium">
                        Question {currentQuestionIndex + 1} of {extractedQuestions.length}
                      </div>
                      
                      <button
                        onClick={() => setCurrentQuestionIndex(prevIndex => Math.min(extractedQuestions.length - 1, prevIndex + 1))}
                        disabled={currentQuestionIndex >= extractedQuestions.length - 1 || loading || saving}
                        className="px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next →
                      </button>
                    </div>
                    
                    {/* Current Question Card */}
                    <div className="my-4">
                      <QuestionCard
                        key={currentQuestionIndex}
                        data={extractedQuestions[currentQuestionIndex]}
                        onChange={(updated) => handleQuestionChange(currentQuestionIndex, updated)}
                        sourceImageDataUrl={sourceImageDataUrl}
                        pdfBlobUrl={pdfBlobUrl}
                      />
                    </div>
                    
                    {/* Progress Indicator */}
                    <div className="flex items-center justify-center gap-1 my-4">
                      {extractedQuestions.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentQuestionIndex(idx)}
                          className={`w-2.5 h-2.5 rounded-full transition-all ${
                            idx === currentQuestionIndex 
                              ? 'bg-blue-600 w-4' 
                              : 'bg-gray-300 hover:bg-gray-400'
                          }`}
                          aria-label={`Go to question ${idx + 1}`}
                        />
                      ))}
                    </div>
                    
                    {/* Save Button and Manual Override */}
                    <div className="mt-6 flex flex-col items-center gap-3">
                      <button
                        onClick={handleBulkSave}
                        disabled={loading || saving}
                        className="rounded-xl bg-emerald-600 px-8 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? "Saving…" : `Approve All & Save ${extractedQuestions.length} Questions`}
                      </button>
                      
                      {/* Manual override button */}
                      <button
                        onClick={() => openManualPairingModal({
                          id: extractedQuestions[0]?._id,
                          documentType: "Question Paper",
                          paper_reference_key: extractedMeta.paper_reference_key || extractedQuestions[0]?.paper_reference_key
                        })}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Need to manually pair? Click here
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Manual Pairing Modal */}
        <ManualPairingModal 
          isOpen={isManualPairingModalOpen}
          onClose={closeManualPairingModal}
          unpaired={selectedUnpairedDoc}
          refreshDbCounts={refreshDbCounts}
        />
      </div>
    </div>
  );
};

export default Dashboard;
