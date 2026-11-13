import type {
  Analytics, ArchiveReport, ChatMessage, ChunkItem, DocumentItem, EvalRun, Execution, ExecutionDetail, Health,
  SessionItem, SettingsPayload, Step,
} from "../types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Can't reach the backend. Start it with `uvicorn app.main:app --port 8000` in the backend folder.");
  }
  if (!res.ok) {
    let detail = `Request failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      if (res.status === 502 || res.status === 504 || res.status === 500)
        detail = "The backend isn't responding. Check that it is running on port 8000.";
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export type ProgressFn = (loaded: number, total: number) => void;

/** fetch() can't report upload progress, so large files go through XMLHttpRequest. */
function uploadWithProgress<T>(file: File, onProgress?: ProgressFn): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // Raw body (not multipart): the server writes it to disk once, with no form parsing.
    xhr.open("POST", `/api/v1/documents/stream?filename=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else
        reject(new ApiError(xhr.status, typeof body?.detail === "string" ? body.detail
          : xhr.status === 413 ? "The file is larger than the server's upload limit."
          : `Upload failed (HTTP ${xhr.status}). Check the backend terminal for details.`));
    };
    xhr.onerror = () => reject(new ApiError(0, "The upload was interrupted. Check that the backend is still running on port 8000."));
    xhr.send(file);
  });
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface QueryOptions {
  question: string;
  session_id?: string | null;
  document_ids?: string[];
  mode?: "self_healing" | "baseline";
  fault_injection?: boolean;
  max_retries?: number;
}

export interface StreamStart {
  session_id: string;
  provider: string;
  model: string;
  documents_in_scope: number;
  max_retrieval_attempts: number;
  max_regenerations: number;
  mode: string;
}

export const api = {
  health: () => request<Health>("/api/v1/health"),

  documents: () => request<DocumentItem[]>("/api/v1/documents"),
  document: (id: string) => request<DocumentItem>(`/api/v1/documents/${id}`),
  chunks: (id: string, limit = 30, offset = 0) =>
    request<{ total: number; chunks: ChunkItem[] }>(`/api/v1/documents/${id}/chunks?limit=${limit}&offset=${offset}`),
  upload: (file: File, onProgress?: ProgressFn) =>
    uploadWithProgress<{ document: DocumentItem; job_id: string | null; duplicate: boolean }>(file, onProgress),
  uploadArchive: (file: File, onProgress?: ProgressFn) =>
    uploadWithProgress<ArchiveReport>(file, onProgress),
  loadSample: () =>
    request<{ document: DocumentItem; job_id: string | null; duplicate: boolean }>("/api/v1/documents/sample", { method: "POST" }),
  deleteDocument: (id: string) => request<{ deleted: string }>(`/api/v1/documents/${id}`, { method: "DELETE" }),
  reindex: (id: string) => request<{ document: DocumentItem }>(`/api/v1/documents/${id}/reindex`, { method: "POST" }),

  suggestions: (documentIds: string[] = []) =>
    request<{ question: string; source: string; answerable: boolean }[]>(
      `/api/v1/suggestions${documentIds.length ? `?document_ids=${encodeURIComponent(documentIds.join(","))}` : ""}`,
    ),

  query: (o: QueryOptions) => request<Execution>("/api/v1/chat/query", json("POST", o)),
  sessions: () => request<SessionItem[]>("/api/v1/sessions"),
  session: (id: string) => request<{ id: string; title: string; messages: ChatMessage[] }>(`/api/v1/sessions/${id}`),
  deleteSession: (id: string) => request<{ deleted: string }>(`/api/v1/sessions/${id}`, { method: "DELETE" }),
  feedback: (id: string, rating: 1 | -1) => request(`/api/v1/executions/${id}/feedback`, json("POST", { rating })),

  executions: (params: { limit?: number; status?: string; mode?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    return request<Execution[]>(`/api/v1/executions?${qs}`);
  },
  execution: (id: string) => request<ExecutionDetail>(`/api/v1/executions/${id}`),

  analytics: () => request<Analytics>("/api/v1/analytics/summary"),

  settings: () => request<SettingsPayload>("/api/v1/settings"),
  updateSettings: (body: Partial<SettingsPayload["runtime"]>) => request<SettingsPayload>("/api/v1/settings", json("PUT", body)),

  reloadSettings: () => request<SettingsPayload>("/api/v1/settings/reload", json("POST")),
  testProvider: (provider: string) =>
    request<{ ok: boolean; model?: string; latency_ms?: number; detail?: string }>("/api/v1/settings/test", json("POST", { provider })),

  evaluations: () => request<EvalRun[]>("/api/v1/evaluations"),
  evaluation: (id: string) => request<EvalRun>(`/api/v1/evaluations/${id}`),
  startEvaluation: (document_ids: string[], name: string) =>
    request<EvalRun>("/api/v1/evaluations/run", json("POST", { name, document_ids, use_sample_dataset: true })),
  exportUrl: (id: string) => `/api/v1/evaluations/${id}/export`,
};

/** POSTs a question and parses the Server-Sent Events stream of graph steps. */
export async function streamQuery(
  o: QueryOptions,
  handlers: {
    onStart?: (s: StreamStart) => void;
    onStep?: (s: Step) => void;
    onResult: (e: Execution) => void;
    onError: (msg: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/v1/chat/stream", { ...json("POST", o), signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    handlers.onError("Can't reach the backend. Make sure it is running on port 8000.");
    return;
  }
  if (!res.ok || !res.body) {
    let detail = `Request failed (HTTP ${res.status}).`;
    try {
      const b = await res.json();
      if (b?.detail) detail = b.detail;
    } catch { /* not JSON */ }
    handlers.onError(detail);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotResult = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        if (!data.length) continue;
        const payload = JSON.parse(data.join("\n"));
        if (event === "start") handlers.onStart?.(payload);
        else if (event === "step") handlers.onStep?.(payload);
        else if (event === "result") {
          gotResult = true;
          handlers.onResult(payload);
        } else if (event === "error") {
          gotResult = true;
          handlers.onError(payload.detail ?? "The pipeline failed.");
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    handlers.onError("The connection to the backend was interrupted.");
    return;
  }
  if (!gotResult) handlers.onError("The stream ended before a result arrived.");
}
