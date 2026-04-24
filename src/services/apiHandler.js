// Ensure you have a .env file in your frontend with: VITE_NODE_API_URL=http://localhost:5000
import axios from "axios";

const NODE_API_URL = import.meta.env.VITE_NODE_API_URL;
const BASE_URL = `${(NODE_API_URL || "http://localhost:5000").replace(/\/+$/, "")}/api`;
const REQUEST_TIMEOUT_MS = 600000;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
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
  const responseData = error?.response?.data;
  const payload =
    responseData && typeof responseData === "object"
      ? responseData
      : { message: typeof responseData === "string" ? responseData : error.message };
  return payload;
};

export const uploadImage = async (imageBase64, metadata, mimeType = "image/png") => {
  try {
    const { data: json } = await apiClient.post("/v1/internal/process-page", {
      imageBase64,
      mime_type: mimeType,
      metadata,
    });
    // Support both flat and nested response envelopes defensively.
    return json?.data?.questions_array || json?.data || [];
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
        ? "Request timed out while extracting questions. Try a smaller image or retry."
        : `Server Error ${error?.response?.status || 500}: Backend crashed or timed out.`);

    throw new ApiPipelineError(message || "Upload failed", {
      stage,
      status: error?.response?.status || null,
      details: payload,
    });
  }
};

export const saveQuestions = async (verifiedQuestionsArray) => {
  try {
    const { data } = await apiClient.post("/v1/internal/save-batch", {
      verifiedQuestionsArray,
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
        ? "Save request timed out while uploading a batch. Reduce batch size and retry."
        : `Server Error ${error?.response?.status || 500}: Failed to save to MongoDB.`);
    throw new ApiPipelineError(errorMessage, {
      status: error?.response?.status || null,
      details: payload,
    });
  }
};