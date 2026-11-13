import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, ChevronDown, FileArchive, FileText, FileUp, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { ArchiveReport, ChunkItem, DocumentItem } from "../types";
import { bytes, pageLabel, timeAgo } from "../lib/format";
import { Button, EmptyState, ErrorNote, Meter, PageHeader, Panel, Spinner, cx } from "../components/ui";
import { usePoll } from "../hooks/usePoll";

const ACCEPT = ".zip,.pdf,.docx,.xlsx,.csv,.tsv,.json,.jsonl,.html,.htm,.txt,.md,.markdown";
const PAGE_SIZE = 60;

interface Upload {
  id: string;
  name: string;
  size: number;
  loaded: number;
  phase: "waiting" | "uploading" | "processing";
}

const fmtMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB` : `${mb} MB`);

const DOC_STATUS: Record<DocumentItem["status"], { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-indigo-soft text-indigo" },
  processing: { label: "Indexing", cls: "bg-indigo-soft text-indigo" },
  ready: { label: "Ready", cls: "bg-accepted-soft text-accepted" },
  failed: { label: "Failed", cls: "bg-error-soft text-error" },
  duplicate: { label: "Duplicate", cls: "bg-healing-soft text-healing" },
};

function cleaningLine(c: Record<string, number> | null): string | null {
  if (!c) return null;
  const parts: string[] = [];
  if (c.rows_in) parts.push(`${c.rows_kept.toLocaleString()} of ${c.rows_in.toLocaleString()} rows kept`);
  if (c.rows_embedded && c.rows_embedded < c.rows_kept)
    parts.push(`column profile covers all rows, ${c.rows_embedded.toLocaleString()} sampled rows searchable`);
  if (c.duplicate_rows_dropped) parts.push(`${c.duplicate_rows_dropped.toLocaleString()} duplicates removed`);
  if (c.empty_rows_dropped) parts.push(`${c.empty_rows_dropped.toLocaleString()} empty rows removed`);
  if (c.null_cells_dropped) parts.push(`${c.null_cells_dropped.toLocaleString()} null cells skipped`);
  if (c.empty_columns_dropped) parts.push(`${c.empty_columns_dropped} empty columns removed`);
  if (c.duplicate_paragraphs_dropped) parts.push(`${c.duplicate_paragraphs_dropped} repeated paragraphs removed`);
  if (c.malformed_rows_skipped) parts.push(`${c.malformed_rows_skipped} malformed rows skipped`);
  if (c.truncated) parts.push("table truncated at the row limit");
  return parts.length ? parts.join(" · ") : null;
}

function ArchiveSummary({ r, onClose }: { r: ArchiveReport; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const m = r.summary;
  const details = [...r.duplicates.map((d) => ({ ...d, kind: "Duplicate" })), ...r.skipped.map((d) => ({ ...d, kind: "Skipped" }))];
  return (
    <div className="glass mb-4 rounded-[22px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-white text-indigo shadow-sm"><FileArchive className="size-4" /></div>
          <div>
            <h2 className="font-display text-sm font-semibold">{r.archive}</h2>
            <p className="text-xs text-muted">
              {m.queued} queued for indexing · {m.duplicates} duplicates · {m.skipped} skipped
              {m.system_files_ignored ? ` · ${m.system_files_ignored} system files ignored` : ""}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-white" aria-label="Dismiss report"><X className="size-4" /></button>
      </div>
      {details.length > 0 && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo" aria-expanded={open}>
            <ChevronDown className={cx("size-3.5 transition", open && "rotate-180")} />
            {open ? "Hide" : "Show"} duplicates and skipped files
          </button>
          {open && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs scroll-thin">
              {details.map((d, i) => (
                <li key={i} className="flex gap-2 rounded-lg bg-white/70 px-2.5 py-1.5">
                  <span className={cx("shrink-0 font-semibold", d.kind === "Duplicate" ? "text-healing" : "text-withheld")}>{d.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-ink" title={d.name}>{d.name}</span>
                  <span className="hidden text-muted sm:inline">{d.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Preview({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const [chunks, setChunks] = useState<ChunkItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.chunks(doc.id, 50).then((r) => (setChunks(r.chunks), setTotal(r.total))).catch((e) => setErr(e.message));
  }, [doc.id]);
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className="glass-strong flex h-full max-h-[calc(100vh-48px)] flex-col rounded-[22px]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line/70 p-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-base font-semibold">{doc.name}</h2>
          <p className="text-xs text-muted">
            {total} chunks, indexed with {doc.embedding_model}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-white" aria-label="Close preview">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4 scroll-thin">
        {err && <ErrorNote message={err} />}
        {!chunks && !err && <Spinner label="Loading chunks" />}
        {chunks?.map((c) => (
          <article key={c.chunk_id} className="rounded-xl bg-white/80 p-3">
            <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-muted">
              <span className="font-semibold text-indigo">Chunk {c.rank + 1}</span>
              {pageLabel(c.page_start, c.page_end) && <span>{pageLabel(c.page_start, c.page_end)}</span>}
              {c.section && <span className="truncate">{c.section}</span>}
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{c.text}</p>
          </article>
        ))}
        {chunks && total > chunks.length && (
          <p className="text-center text-xs text-muted">Showing the first {chunks.length} of {total} chunks.</p>
        )}
      </div>
    </motion.div>
  );
}

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const [reports, setReports] = useState<ArchiveReport[]>([]);
  const [limits, setLimits] = useState<{ file: number; zip: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<DocumentItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => api.documents().then(setDocs).catch((e) => setError(e.message)), []);
  useEffect(() => {
    refresh();
    api.settings().then((d) => setLimits({ file: d.limits.max_upload_mb, zip: d.limits.max_archive_mb })).catch(() => {});
  }, [refresh]);

  const active = (docs ?? []).some((d) => d.status === "queued" || d.status === "processing");
  usePoll(refresh, 1500, active || uploads.length > 0);

  const patchUpload = (id: string, p: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...p } : u)));

  const uploadFiles = async (files: FileList | File[]) => {
    setError(null);
    setNotice(null);
    const list = Array.from(files);
    const batch: Upload[] = list.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, loaded: 0, phase: "waiting",
    }));
    setUploads((u) => [...u, ...batch]);
    const dupes: string[] = [];
    // One at a time: keeps the browser and the server from juggling several huge bodies.
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const id = batch[i].id;
      const isZip = f.name.toLowerCase().endsWith(".zip");
      patchUpload(id, { phase: "uploading" });
      const onProgress = (loaded: number, total: number) =>
        patchUpload(id, { loaded, phase: loaded >= total ? "processing" : "uploading" });
      try {
        if (isZip) {
          const r = await api.uploadArchive(f, onProgress);
          setReports((rs) => [r, ...rs].slice(0, 5));
        } else {
          const r = await api.upload(f, onProgress);
          if (r.duplicate) dupes.push(f.name);
        }
      } catch (e) {
        setFailures((x) => [...x, `${f.name}: ${(e as Error).message}`]);
      } finally {
        setUploads((u) => u.filter((x) => x.id !== id));
        refresh();
      }
    }
    if (dupes.length) setNotice(`Already indexed, skipped: ${dupes.join(", ")}`);
  };

  const loadSample = async () => {
    setError(null);
    try {
      const r = await api.loadSample();
      if (r.duplicate) setNotice("The sample handbook is already in your library.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await api.deleteDocument(id);
      if (preview?.id === id) setPreview(null);
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reindex = async (id: string) => {
    setBusy(id);
    try {
      await api.reindex(id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cx("grid gap-4", preview && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
      <div>
        <PageHeader
          title="Documents"
          sub="Everything the assistant can cite. Tables are loaded into a local query engine so counts cover every row; text files are split into passages and indexed locally."
          actions={
            <Button variant="soft" icon={<Sparkles className="size-4" />} onClick={loadSample}>
              Load sample handbook
            </Button>
          }
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
          className={cx(
            "glass mb-4 flex flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed px-6 py-9 text-center transition",
            drag ? "border-indigo bg-indigo-soft/60" : "border-indigo/20",
          )}
        >
          <div className="grid size-12 place-items-center rounded-2xl bg-white text-indigo shadow-sm">
            <FileUp className="size-5" />
          </div>
          <div>
            <p className="font-display font-semibold">Drop files here or choose them</p>
            <p className="mt-1 text-sm text-muted">PDF, Word, Excel, CSV, JSON, HTML, text or Markdown, or a ZIP of any of them. Select as many as you like.</p>
            <p className="mt-0.5 text-xs text-faint">
              {limits ? `Up to ${fmtMB(limits.file)} per file and ${fmtMB(limits.zip)} per ZIP. ` : ""}Duplicates, empty rows and null values are removed.
            </p>
          </div>
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            {uploads.length ? "Add more files" : "Choose files or a ZIP"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploads.length > 0 && (
          <Panel className="mb-4 space-y-3 p-4" >
            {uploads.map((u) => (
              <div key={u.id}>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-ink" title={u.name}>{u.name}</span>
                  <span className="num shrink-0 text-muted">
                    {u.phase === "waiting" && "Waiting"}
                    {u.phase === "uploading" && `${bytes(u.loaded)} of ${bytes(u.size)}`}
                    {u.phase === "processing" && (u.name.toLowerCase().endsWith(".zip") ? "Unpacking and checking files…" : "Checking file…")}
                  </span>
                </div>
                <Meter value={u.phase === "processing" ? 1 : u.size ? u.loaded / u.size : 0} tone={u.phase === "processing" ? "cyan" : "indigo"} />
              </div>
            ))}
          </Panel>
        )}
        {reports.map((r, i) => (
          <ArchiveSummary key={`${r.archive}-${i}`} r={r} onClose={() => setReports((x) => x.filter((_, j) => j !== i))} />
        ))}
        {failures.length > 0 && (
          <div className="mb-3">
            <ErrorNote message={failures.join("  |  ")} onDismiss={() => setFailures([])} />
          </div>
        )}
        {error && <div className="mb-3"><ErrorNote message={error} onDismiss={() => setError(null)} /></div>}
        {notice && (
          <div className="mb-3 rounded-xl bg-white/80 px-3.5 py-2.5 text-sm text-muted">{notice}</div>
        )}

        {docs === null ? (
          <Spinner label="Loading documents" />
        ) : docs.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="No documents yet"
              body="Upload a file above, or load the sample security handbook to try the healing loop right away."
              action={<Button variant="primary" onClick={loadSample}>Load sample handbook</Button>}
            />
          </Panel>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {docs.slice(0, visible).map((d) => {
              const st = DOC_STATUS[d.status];
              const progress = d.job?.progress ?? (d.status === "ready" ? 1 : 0);
              return (
                <Panel key={d.id} className={cx("lift p-4", preview?.id === d.id && "ring-2 ring-indigo/30")}>
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-indigo shadow-sm">
                      <FileText className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate font-semibold text-ink" title={d.name}>{d.name}</h3>
                        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
                      </div>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>{bytes(d.size_bytes)}</span>
                        {d.status === "ready" && <span>{d.chunk_count} chunks</span>}
                        {d.pages > 1 && <span>{d.pages} pages</span>}
                        <span>{timeAgo(d.indexed_at ?? d.created_at)}</span>
                      </p>
                    </div>
                  </div>

                  {(d.status === "queued" || d.status === "processing") && (
                    <div className="mt-3 space-y-1.5">
                      <Meter value={progress} />
                      <p className="text-xs text-muted">{d.job?.stage ?? "Queued"}</p>
                    </div>
                  )}
                  {cleaningLine(d.cleaning) && d.status === "ready" && (
                    <p className="mt-3 rounded-lg bg-accepted-soft/60 px-2.5 py-1.5 text-xs text-accepted">Cleaned: {cleaningLine(d.cleaning)}</p>
                  )}
                  {d.status === "duplicate" && d.error && <p className="mt-3 rounded-lg bg-healing-soft/70 px-2.5 py-2 text-xs text-healing">{d.error}</p>}
                  {d.status === "failed" && d.error && <p className="mt-3 rounded-lg bg-error-soft/70 px-2.5 py-2 text-xs text-error">{d.error}</p>}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {d.status === "ready" && (
                      <Button variant="soft" className="px-2.5 py-1.5 text-xs" icon={<BookOpen className="size-3.5" />} onClick={() => setPreview(d)}>
                        Preview chunks
                      </Button>
                    )}
                    {(d.status === "ready" || d.status === "failed") && (
                      <Button variant="ghost" className="px-2.5 py-1.5 text-xs" icon={<RotateCcw className="size-3.5" />} loading={busy === d.id} onClick={() => reindex(d.id)}>
                        Re-index
                      </Button>
                    )}
                    {d.status !== "processing" && (
                      confirmDelete === d.id ? (
                        <span className="ml-auto inline-flex items-center gap-1.5 text-xs">
                          <span className="text-muted">Delete for good?</span>
                          <Button variant="danger" className="px-2.5 py-1.5 text-xs" loading={busy === d.id} onClick={() => remove(d.id)}>
                            Delete
                          </Button>
                          <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={() => setConfirmDelete(null)}>
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <Button variant="ghost" className="ml-auto px-2.5 py-1.5 text-xs hover:text-error" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(d.id)}>
                          Delete
                        </Button>
                      )
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
        {docs && docs.length > visible && (
          <div className="mt-4 text-center">
            <Button variant="soft" onClick={() => setVisible((v) => v + PAGE_SIZE)}>Show more ({docs.length - visible} left)</Button>
          </div>
        )}
      </div>
      <AnimatePresence>{preview && <div className="xl:sticky xl:top-6"><Preview key={preview.id} doc={preview} onClose={() => setPreview(null)} /></div>}</AnimatePresence>
    </div>
  );
}
