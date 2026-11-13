export type ExecStatus = "running" | "accepted" | "abstained" | "error" | "answered";

export interface Source {
  label: string;
  chunk_id: string;
  document_id: string;
  filename: string;
  page_start: number | null;
  page_end: number | null;
  section: string;
  score: number | null;
  text: string;
}

export interface Execution {
  execution_id: string;
  session_id: string | null;
  mode: "self_healing" | "baseline";
  status: ExecStatus;
  question: string;
  answer: string;
  sources: Source[];
  healing: {
    triggered: boolean;
    retrieval_attempts: number;
    regeneration_attempts: number;
    reason: string | null;
    final_query: string | null;
  };
  evaluation: {
    grounded?: boolean | null;
    complete?: boolean | null;
    citations_valid?: boolean | null;
    lexical_groundedness?: number | null;
    critic_verdict?: string | null;
  };
  missing_information: string[];
  path: string[];
  latency_ms: number;
  provider: string;
  model: string;
  created_at: string | null;
}

export interface Step {
  step_number: number;
  node: string;
  title: string;
  outcome: "ok" | "warn" | "fail";
  duration_ms: number;
  detail: Record<string, any>;
  decision: string;
}

export interface ExecutionDetail extends Execution {
  steps: Step[];
  retrievals: { attempt: number; query: string; chunk_id: string; document_id: string; rank: number; score: number | null; relevant: boolean | null }[];
  critiques: any[];
}

export interface DocumentItem {
  id: string;
  name: string;
  extension: string;
  size_bytes: number;
  status: "queued" | "processing" | "ready" | "failed" | "duplicate";
  pages: number;
  chunk_count: number;
  error: string | null;
  embedding_model: string | null;
  index_version: string | null;
  cleaning: Record<string, number> | null;
  created_at: string | null;
  indexed_at: string | null;
  job: { id: string; status: string; stage: string; progress: number; error: string | null } | null;
}

export interface ChunkItem {
  chunk_id: string;
  text: string;
  page_start: number | null;
  page_end: number | null;
  section: string;
  rank: number;
}

export interface SessionItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  execution: Execution | null;
}

export interface Provider {
  id: "offline" | "ollama" | "groq" | "openai";
  label: string;
  available: boolean;
  local: boolean;
  model: string;
  models: string[];
  note: string;
}

export interface SettingsPayload {
  runtime: {
    provider: Provider["id"];
    ollama_model: string;
    groq_model: string;
    openai_model: string;
    top_k: number;
    max_corrective_retries: number;
    max_regenerations: number;
  };
  active_model: string;
  providers: Provider[];
  processing_is_local: boolean;
  diagnostics: {
    env_file: string;
    env_file_exists: boolean;
    keys: Record<"groq" | "openai", {
      set: boolean; in_env_file: boolean; looks_valid: boolean;
      has_whitespace_or_quotes: boolean; env_var_override: boolean;
    }>;
  };
  embedding: { name: string; backend: string; dim: number; note: string };
  limits: {
    max_corrective_retries: number;
    max_regenerations: number;
    max_top_k: number;
    context_chunks: number;
    chunk_size_tokens: number;
    chunk_overlap_tokens: number;
    max_upload_mb: number;
    max_archive_mb: number;
    max_archive_entries: number;
    max_table_rows: number;
    max_embed_rows: number;
  };
}

export interface Analytics {
  documents: { total: number; ready: number; failed: number; chunks: number };
  queries: number;
  accepted_rate: number;
  abstention_rate: number;
  error_rate: number;
  healing_rate: number;
  healing_success_rate: number;
  avg_retrieval_attempts: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  status_counts: Record<string, number>;
  healing_reasons: { reason: string; count: number }[];
  daily: { date: string; accepted: number; abstained: number; error: number }[];
  recent: Execution[];
}

export interface PipelineScore {
  answered: boolean;
  abstained: boolean;
  error: boolean;
  citations_valid: boolean | null;
  groundedness: number | null;
  fully_grounded: boolean | null;
  keyword_recall: number | null;
  status: string;
  answer: string;
  latency_ms: number;
  retrieval_attempts: number;
  execution_id?: string;
  healing_triggered?: boolean;
  path?: string[];
}

export interface EvalResult {
  question: string;
  answerable: boolean | null;
  category: string | null;
  expected_keywords: string[];
  baseline: PipelineScore;
  self_healing: PipelineScore;
}

export interface EvalSummaryBlock {
  answered_rate: number;
  abstention_rate: number;
  error_rate: number;
  citation_validity: number | null;
  groundedness: number | null;
  unsupported_answer_rate: number | null;
  correct_abstention_rate: number | null;
  false_abstention_rate: number | null;
  keyword_recall: number | null;
  avg_retrieval_attempts: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  healing_rate?: number;
  healing_success_rate?: number | null;
}

export interface EvalRun {
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  total: number;
  config: Record<string, any>;
  summary: { baseline?: EvalSummaryBlock; self_healing?: EvalSummaryBlock };
  error: string | null;
  document_ids: string[];
  created_at: string | null;
  finished_at: string | null;
  results?: EvalResult[];
}

export interface Health {
  status: string;
  version: string;
  provider: string;
  model: string;
  embedding: { name: string; backend: string; dim: number; note: string };
  vector_store: string;
}

export interface ArchiveReport {
  archive: string;
  summary: { files_found: number; queued: number; duplicates: number; skipped: number; system_files_ignored: number };
  duplicates: { name: string; reason: string }[];
  skipped: { name: string; reason: string }[];
}
