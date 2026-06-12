import axios from "axios";

// Sanitizes diagram URLs to ensure they are a flat array of valid strings
const sanitizeDiagramUrls = (raw) => {
    if (!raw) return [];
    const flattened = [];
    const processItem = (item) => {
        if (item === null || item === undefined) return;
        if (Array.isArray(item)) {
            item.forEach(processItem);
        } else if (typeof item === "object") {
            const url = item.secure_url || item.url || item.diagramUrl;
            if (url) processItem(url);
        } else if (typeof item === "string") {
            const trimmed = item.trim();
            if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
                try { return processItem(JSON.parse(trimmed)); } catch(e) {}
            }
            if (trimmed && (trimmed.startsWith("http") || trimmed.startsWith("data:image") || trimmed.startsWith("//") || trimmed.includes("cloudinary") || trimmed === "[NEEDS_CROP]")) {
                flattened.push(trimmed);
            }
        }
    };
    processItem(raw);
    return flattened;
};

const NODE_API_URL = import.meta.env.VITE_NODE_API_URL;
const BASE_URL = `${(NODE_API_URL || "http://localhost:5000").replace(/\/+$/, "")}/api`;
const REQUEST_TIMEOUT_MS = 600000;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

class ApiPipelineError extends Error {
  constructor(message, { stage = null, status = null, details = null } = {}) {
    super(message);
    this.name = "ApiPipelineError";
    this.stage = stage;
    this.status = status;
    this.details = details;
  }
}

const parseErrorPayload = (error) => {
  const d = error?.response?.data;
  return d && typeof d === "object"
    ? d
    : { message: typeof d === "string" ? d : error.message };
};

// ── Upload image / PDF for AI extraction ──────────────────────────────────────
//
// PHASE 1 — bypassCache flag:
//   When bypassCache=true (triggered by "Redo Extraction"):
//     • Node skips its NodeCache lookup for this document.
//     • Node sends `bypassCache: true` in the request body.
//     • ingestionController reads it and passes useCache=false to sendToPythonEngine.
//     • sendToPythonEngine skips the local NodeCache AND sends use_cache=false to Python.
//     • Python's EXTRACTION_CACHE is also bypassed for this request.
//
//   Default: bypassCache=false → normal cache-aware flow.
//
export const uploadImage = async (
  imageBase64,
  metadata,
  mimeType = "image/png",
  firstPageBase64 = null,
  bypassCache = false,        // PHASE 1: forwarded all the way to Python engine
) => {
  try {
    const requestData = {
      imageBase64,
      mime_type: mimeType,
      metadata,
      bypassCache,            // PHASE 1: consumed by ingestionController → pythonEngine
    };
    
    // Add the first page image if provided (for IB board extraction)
    if (firstPageBase64) {
      requestData.page1_image = firstPageBase64;
    }
    
    const { data: json } = await apiClient.post("/v1/internal/process-page", requestData);
    return json?.data || { metadata: {}, questions_array: [] };
  } catch (error) {
    const payload = parseErrorPayload(error);
    const stage = payload?.stage || payload?.details?.error?.stage || null;
    const isTimeout =
      error?.code === "ECONNABORTED" || String(error?.message || "").includes("timeout");
    const message =
      payload?.details?.error?.message ||
      payload?.error ||
      payload?.message ||
      (isTimeout
        ? "Request timed out while extracting questions. Try a smaller file or retry."
        : `Server Error ${error?.response?.status || 500}: Backend crashed or timed out.`);
    throw new ApiPipelineError(message || "Upload failed", {
      stage,
      status: error?.response?.status || null,
      details: payload,
    });
  }
};

// ── Save a verified batch to MongoDB ──────────────────────────────────────────
export const rescueMissingQuestions = async ({
  imageBase64,
  missingIds = [],
  metadata = {},
  mimeType = "application/pdf",
  fileName = "",
  board = "IGCSE",
}) => {
  try {
    const { data: json } = await apiClient.post("/v1/internal/rescue-missing", {
      imageBase64,
      missingIds,
      mime_type: mimeType,
      document_type: "Question Paper",
      file_name: fileName,
      board,
      extra_metadata: metadata,
    });
    return json?.data || { questions_array: [], rescue_report: {} };
  } catch (error) {
    const payload = parseErrorPayload(error);
    const message =
      payload?.details?.error?.message ||
      payload?.message ||
      payload?.detail ||
      `Server Error ${error?.response?.status || 500}: Targeted rescue failed.`;
    throw new ApiPipelineError(message, {
      stage: payload?.stage || payload?.details?.error?.stage || "rescue_missing",
      status: error?.response?.status || null,
      details: payload,
    });
  }
};

export const saveQuestions = async (questionsToSave) => {
  try {
      const cleanPaperNum = (val) => {
        const num = parseInt(val, 10);
        if (isNaN(num)) return 0;
        if (num > 6) return parseInt(String(num)[0], 10);
        return num;
      };

      const sanitizedQuestions = questionsToSave.map(q => {
        const newQ = { ...q };
        
        // Sanitize diagram_urls if present
        if (newQ.diagram_urls) {
          newQ.diagram_urls = sanitizeDiagramUrls(newQ.diagram_urls);
        }

        // Clean root level (both cases)
        if (newQ.paperNumber !== undefined) newQ.paperNumber = cleanPaperNum(newQ.paperNumber);
        if (newQ.paper_number !== undefined) newQ.paper_number = cleanPaperNum(newQ.paper_number);
        
        // Clean nested metadata level (both cases)
        if (newQ.metadata) {
          if (newQ.metadata.paperNumber !== undefined) newQ.metadata.paperNumber = cleanPaperNum(newQ.metadata.paperNumber);
          if (newQ.metadata.paper_number !== undefined) newQ.metadata.paper_number = cleanPaperNum(newQ.metadata.paper_number);
        }
        
        return newQ;
      });
      
      const { data } = await apiClient.post("/v1/internal/save-batch", {
        questionsArray: sanitizedQuestions, // matches: req.body.questionsArray in controller
    });
    return data;
  } catch (error) {
    const payload = parseErrorPayload(error);
    const isTimeout =
      error?.code === "ECONNABORTED" || String(error?.message || "").includes("timeout");
    const errorMessage =
      payload?.error ||
      payload?.message ||
      (isTimeout
        ? "Save request timed out. Reduce batch size and retry."
        : `Server Error ${error?.response?.status || 500}: Failed to save to MongoDB.`);
    throw new ApiPipelineError(errorMessage, {
      status: error?.response?.status || null,
      details: payload,
    });
  }
};

// ── Fetch live question counts from DB (for SessionTracker) ───────────────────
// Expects the Node backend to expose GET /api/v1/internal/counts
// returning { questionPapers: number, markingSchemes: number }
export const fetchQuestionCount = async () => {
  try {
    const { data } = await apiClient.get("/v1/internal/counts");
    return {
      questionPapers: data?.questionPapers ?? data?.data?.questionPapers ?? 0,
      markingSchemes: data?.markingSchemes ?? data?.data?.markingSchemes ?? 0,
    };
  } catch {
    return { questionPapers: 0, markingSchemes: 0 };
  }
};

// ── Fetch QA Dashboard Report ────────────────────────────────────────────────
export const fetchQADashboardReport = async (force = false) => {
  try {
    const url = force ? `/v1/internal/qa-dashboard?force=true` : `/v1/internal/qa-dashboard`;
    const { data } = await apiClient.get(url);
    return data;
  } catch (error) {
    const payload = parseErrorPayload(error);
    const errorMessage =
      payload?.message ||
      payload?.error ||
      `Server Error ${error?.response?.status || 500}: Failed to load QA report.`;
    throw new ApiPipelineError(errorMessage, {
      status: error?.response?.status || null,
      details: payload,
    });
  }
};

// ── Manual pairing fallback API ───────────────────────────────────────────────
// Used when AI pairing fails or for direct administrator manual pairing
export const manualPairDocuments = async (qp_id, ms_id, ref_code_override = null) => {
  try {
    const { data } = await apiClient.post("/v1/internal/papers/manual-pair", {
      qp_id,
      ms_id,
      ref_code_override,
    });
    
    return data;
  } catch (error) {
    const payload = parseErrorPayload(error);
    const errorMessage = 
      payload?.message || 
      payload?.error || 
      `Server Error ${error?.response?.status || 500}: Failed to manually pair documents.`;
      
    throw new ApiPipelineError(errorMessage, {
      status: error?.response?.status || null,
      details: payload,
    });
  }
};

export const runQARepairAction = async (payload) => {
  try {
    const { data } = await apiClient.post("/v1/internal/qa-dashboard/repair", payload);
    return data;
  } catch (error) {
    const payloadData = parseErrorPayload(error);
    const errorMessage =
      payloadData?.message ||
      payloadData?.error ||
      `Server Error ${error?.response?.status || 500}: Failed to run QA repair action.`;
    throw new ApiPipelineError(errorMessage, {
      status: error?.response?.status || null,
      details: payloadData,
    });
  }
};
