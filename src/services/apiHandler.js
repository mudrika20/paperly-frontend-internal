import axios from "axios";

// Sanitizes diagram URLs to ensure they are a flat array of valid strings
function sanitizeDiagramUrls(diagramUrls) {
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
}

const NODE_API_URL = import.meta.env.VITE_NODE_API_URL;
const BASE_URL = `${(NODE_API_URL || "http://localhost:5000").replace(/\/+$/, "")}/api`;
const REQUEST_TIMEOUT_MS = 600000;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

// Direct client for bypassing Node and hitting Python Engine directly
const PYTHON_API_URL = "http://localhost:8000/api";
const pythonApiClient = axios.create({
  baseURL: PYTHON_API_URL,
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
export const uploadImage = async (imageBase64, metadata, mimeType = "image/png", firstPageBase64 = null) => {
  try {
    // Add board information and first page extraction for IB documents
    const requestData = {
      imageBase64,
      mime_type: mimeType,
      metadata,
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
          console.log("API sanitized diagram_urls:", newQ.diagram_urls);
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
      payload?.message ||
      payload?.error ||
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
