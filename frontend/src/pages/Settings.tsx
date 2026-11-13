import { useEffect, useState } from "react";
import { Check, Cloud, HardDrive, PlugZap, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import type { SettingsPayload } from "../types";
import { Button, ErrorNote, PageHeader, Panel, Spinner, cx } from "../components/ui";

type Runtime = SettingsPayload["runtime"];
type KeyInfo = SettingsPayload["diagnostics"]["keys"]["groq"];

function keyHint(k: KeyInfo): { text: string; ok: boolean } {
  if (k.set && k.looks_valid && !k.has_whitespace_or_quotes) return { text: "Key loaded.", ok: true };
  if (k.set && k.has_whitespace_or_quotes) return { text: "Key loaded but contains spaces or quotes. Remove them in .env.", ok: false };
  if (k.set) return { text: "Key loaded, but its format looks unusual. Use Test connection.", ok: false };
  if (k.env_var_override) return { text: "A system environment variable with this name exists and may override .env.", ok: false };
  if (k.in_env_file) return { text: "Key is in .env but not loaded yet. Click Reload .env.", ok: false };
  return { text: "No key found in .env.", ok: false };
}

function Slider({ label, help, value, min, max, onChange }: { label: string; help: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="num font-semibold text-indigo">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#4f46e5]" />
      <p className="mt-0.5 text-xs text-muted">{help}</p>
    </label>
  );
}

export default function Settings() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [draft, setDraft] = useState<Runtime | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.settings().then((d) => (setData(d), setDraft(d.runtime))).catch((e) => setError(e.message));
  }, []);

  if (error && !data) return <ErrorNote message={error} />;
  if (!data || !draft) return <Spinner label="Loading settings" />;

  const set = (p: Partial<Runtime>) => {
    setSaved(false);
    setDraft({ ...draft, ...p });
  };
  const provider = data.providers.find((p) => p.id === draft.provider)!;
  const modelKey = (draft.provider + "_model") as "ollama_model" | "groq_model" | "openai_model";
  const totalAttempts = draft.max_corrective_retries + 1;

  const reload = async () => {
    setReloading(true);
    setError(null);
    try {
      const d = await api.reloadSettings();
      setData(d);
      setTestResult(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReloading(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testProvider(draft.provider);
      setTestResult(r.ok ? { ok: true, text: `Connected to ${r.model}${r.latency_ms ? ` in ${r.latency_ms} ms` : ""}.` } : { ok: false, text: r.detail ?? "The connection failed." });
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const d = await api.updateSettings(draft);
      setData(d);
      setDraft(d.runtime);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Settings"
        sub="Choose the model and the retry policy. The server enforces its own upper limits whatever is set here."
        actions={
          <Button variant="primary" onClick={save} loading={saving} icon={saved ? <Check className="size-4" /> : undefined}>
            {saved ? "Saved" : "Save changes"}
          </Button>
        }
      />
      {error && <div className="mb-3"><ErrorNote message={error} onDismiss={() => setError(null)} /></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-display text-base font-semibold">Language model</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.providers.map((p) => (
              <button
                key={p.id}
                disabled={!p.available}
                onClick={() => set({ provider: p.id })}
                className={cx(
                  "rounded-2xl border p-3.5 text-left transition disabled:cursor-not-allowed",
                  draft.provider === p.id ? "border-indigo bg-white shadow-[0_10px_24px_-16px_rgba(79,70,229,0.8)]" : "border-white bg-white/60 hover:bg-white/90",
                  !p.available && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{p.label}</span>
                  {p.local ? <HardDrive className="size-4 text-accepted" /> : <Cloud className="size-4 text-cyan" />}
                </div>
                <span className={cx("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", p.available ? "bg-accepted-soft text-accepted" : "bg-line text-muted")}>
                  {p.available ? "Available" : "Not set up"}
                </span>
                <p className="mt-2 text-xs leading-relaxed text-muted">{p.note}</p>
              </button>
            ))}
          </div>

          {draft.provider !== "offline" && (
            <div className="mt-4 max-w-md">
              <label className="mb-1 block text-sm font-semibold">Model</label>
              {draft.provider === "ollama" ? (
                <select
                  value={draft.ollama_model || provider.model}
                  onChange={(e) => set({ ollama_model: e.target.value })}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-indigo/50"
                >
                  {provider.models.map((m) => <option key={m}>{m}</option>)}
                </select>
              ) : (
                <input
                  value={draft[modelKey] || provider.model}
                  onChange={(e) => set({ [modelKey]: e.target.value } as Partial<Runtime>)}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-indigo/50"
                />
              )}
            </div>
          )}

          <div className="mt-4 rounded-2xl bg-white/70 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><PlugZap className="size-4 text-indigo" /> Connection</h3>
              <div className="flex gap-2">
                <Button variant="soft" className="px-3 py-1.5 text-xs" icon={<RefreshCw className="size-3.5" />} loading={reloading} onClick={reload}>
                  Reload .env
                </Button>
                <Button variant="soft" className="px-3 py-1.5 text-xs" loading={testing} onClick={test}>
                  Test {provider.label}
                </Button>
              </div>
            </div>
            <dl className="space-y-1 text-xs">
              {(["groq", "openai"] as const).map((n) => {
                const h = keyHint(data.diagnostics.keys[n]);
                return (
                  <div key={n} className="flex flex-wrap gap-x-2">
                    <dt className="w-14 font-semibold capitalize text-ink">{n === "openai" ? "OpenAI" : "Groq"}</dt>
                    <dd className={h.ok ? "text-accepted" : "text-healing"}>{h.text}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-2 break-all text-[11px] text-faint">
              {data.diagnostics.env_file_exists ? "Reading" : "Missing"}: {data.diagnostics.env_file}
            </p>
            {testResult && (
              <p role="status" className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${testResult.ok ? "bg-accepted-soft text-accepted" : "bg-error-soft text-error"}`}>
                {testResult.text}
              </p>
            )}
          </div>

          {!provider.local && (
            <div className="mt-4 flex gap-2 rounded-xl bg-healing-soft/80 px-3.5 py-2.5 text-sm text-healing">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <span>Hosted model: the passages retrieved for each question are sent to {provider.label}. Use a local option for private documents.</span>
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Healing policy</h2>
          <div className="space-y-5">
            <Slider
              label="Corrective searches"
              value={draft.max_corrective_retries}
              min={0}
              max={data.limits.max_corrective_retries}
              onChange={(v) => set({ max_corrective_retries: v })}
              help={`Up to ${totalAttempts} search${totalAttempts > 1 ? "es" : ""} per question, including the first. Then it answers or declines.`}
            />
            <Slider
              label="Answer rewrites"
              value={draft.max_regenerations}
              min={0}
              max={data.limits.max_regenerations}
              onChange={(v) => set({ max_regenerations: v })}
              help="Rewrites from the same evidence when the verifier rejects claims that the passages can't support."
            />
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold">Retrieval</h2>
          <Slider
            label="Passages retrieved"
            value={draft.top_k}
            min={1}
            max={data.limits.max_top_k}
            onChange={(v) => set({ top_k: v })}
            help={`Candidates per search. The best ${data.limits.context_chunks} relevant ones go to the model.`}
          />
          <dl className="mt-5 space-y-2 rounded-xl bg-white/70 p-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Embeddings</dt><dd className="font-semibold">{data.embedding.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Chunk size</dt><dd className="num">{data.limits.chunk_size_tokens} tokens, {data.limits.chunk_overlap_tokens} overlap</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Upload limit</dt><dd className="num">{data.limits.max_upload_mb} MB</dd></div>
          </dl>
          {data.embedding.backend === "hashing" && <p className="mt-3 text-xs text-healing">{data.embedding.note}</p>}
        </Panel>
      </div>
    </div>
  );
}
