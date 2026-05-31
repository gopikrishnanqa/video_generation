"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  MUSIC_MP3,
  MUSIC_TRACKS,
  MUSIC_WAV,
  POSTER_SAMPLES,
} from "@/lib/media-catalog";
import {
  buildFilenames,
  downloadMetadataJson,
  revokeIfBlobUrl,
} from "@/lib/download-utils";
import { convertWebmToMp4 } from "@/lib/mp4-export";
import { generatePosterVideo } from "@/lib/video-generator";
import {
  applyMetadataJson,
  DEFAULT_VIDEO_METADATA,
  METADATA_FIELD_LABELS,
  METADATA_JSON_TEMPLATE,
  metadataToExportJson,
  type VideoMetadata,
} from "@/lib/video-metadata";

type TimingState = {
  blueIntroSeconds: number;
  sectionRevealSeconds: number;
  holdFullSeconds: number;
  scatterSeconds: number;
  holdShakeIntensity: number;
  sectionCount: "auto" | number;
};

const DEFAULT_TIMING: TimingState = {
  blueIntroSeconds: 1.5,
  sectionRevealSeconds: 0.55,
  holdFullSeconds: 1.2,
  scatterSeconds: 2,
  holdShakeIntensity: 1,
  sectionCount: "auto",
};

export default function Home() {
  const [selectedSample, setSelectedSample] = useState<string | null>(
    POSTER_SAMPLES[0].src
  );
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    POSTER_SAMPLES[0].src
  );
  const [timing, setTiming] = useState(DEFAULT_TIMING);
  const [selectedMusicId, setSelectedMusicId] = useState<string>("");
  const [musicVolume, setMusicVolume] = useState(0.85);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState<VideoMetadata>(DEFAULT_VIDEO_METADATA);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [sectionCount, setSectionCount] = useState<number | null>(null);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [canRetryMp4, setCanRetryMp4] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mp4Revoke = useRef<string | null>(null);
  const webmBlobRef = useRef<Blob | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement>(null);

  const selectedMusic = useMemo(
    () => MUSIC_TRACKS.find((t) => t.id === selectedMusicId),
    [selectedMusicId]
  );

  const estimatedDuration = useMemo(() => {
    const sections =
      timing.sectionCount === "auto" ? 10 : Number(timing.sectionCount);
    return (
      timing.blueIntroSeconds +
      sections * timing.sectionRevealSeconds +
      timing.holdFullSeconds +
      timing.scatterSeconds
    ).toFixed(1);
  }, [timing]);

  const setPreview = useCallback((url: string) => {
    setPreviewUrl(url);
    setSelectedSample(url.startsWith("/samples") ? url : null);
  }, []);

  const onUpload = (file: File | null) => {
    setUploadFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      setSelectedSample(null);
    } else if (selectedSample) {
      setPreview(selectedSample);
    }
  };

  const onMusicChange = (id: string) => {
    setSelectedMusicId(id);
    if (musicPreviewRef.current) {
      musicPreviewRef.current.pause();
    }
  };

  const onGenerate = async () => {
    const source = uploadFile ?? selectedSample;
    if (!source) {
      setStatus("Select a sample or upload an image.");
      return;
    }

    revokeIfBlobUrl(mp4Revoke.current);
    mp4Revoke.current = null;
    setMp4Url(null);
    setCanRetryMp4(false);
    webmBlobRef.current = null;
    setBusy(true);
    setProgress(0);
    setStatus("Rendering animation…");

    let sections = 0;
    let durationSeconds = 0;

    try {
      const result = await generatePosterVideo(source, {
        blueIntroSeconds: timing.blueIntroSeconds,
        sectionRevealSeconds: timing.sectionRevealSeconds,
        holdFullSeconds: timing.holdFullSeconds,
        scatterSeconds: timing.scatterSeconds,
        holdShakeIntensity: timing.holdShakeIntensity,
        sectionCount: timing.sectionCount,
        musicSrc: selectedMusic?.src ?? null,
        musicVolume,
        onProgress: (pct) => setProgress(Math.round(pct * 0.65)),
      });
      webmBlobRef.current = result.blob;
      sections = result.sections.length;
      durationSeconds = result.durationSeconds;
      setSectionCount(sections);
      setLastDuration(durationSeconds);

      await encodeMp4FromWebm(result.blob, sections, durationSeconds);
    } catch (e) {
      if (webmBlobRef.current) {
        setCanRetryMp4(true);
        setStatus(
          e instanceof Error
            ? `${e.message} — click Retry MP4 below.`
            : "MP4 failed — click Retry MP4 below."
        );
      } else {
        setStatus(
          e instanceof Error ? e.message : "Generation failed. Try Chrome or Edge."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const filenames = useMemo(() => buildFilenames(metadata), [metadata]);

  const encodeMp4FromWebm = async (
    webmBlob: Blob,
    sections: number,
    durationSeconds: number
  ) => {
    setStatus("Encoding MP4 with metadata…");
    const mp4Blob = await convertWebmToMp4(webmBlob, {
      metadata,
      onProgress: (pct) => setProgress(65 + Math.round(pct * 0.35)),
      onStatus: setStatus,
    });
    revokeIfBlobUrl(mp4Revoke.current);
    const url = URL.createObjectURL(mp4Blob);
    mp4Revoke.current = url;
    setMp4Url(url);
    setCanRetryMp4(false);
    webmBlobRef.current = null;
    const musicLabel = selectedMusic ? selectedMusic.name : "no music";
    setProgress(100);
    setStatus(
      `MP4 ready — ${sections} sections, ${durationSeconds.toFixed(1)}s, ${musicLabel}.`
    );
  };

  const retryMp4 = async () => {
    const blob = webmBlobRef.current;
    if (!blob || busy) return;
    setBusy(true);
    setCanRetryMp4(false);
    setProgress(65);
    try {
      await encodeMp4FromWebm(
        blob,
        sectionCount ?? 0,
        lastDuration ?? 0
      );
    } catch (e) {
      setCanRetryMp4(true);
      setStatus(
        e instanceof Error ? e.message : "MP4 encoding failed. Try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Poster Video Generator</h1>
        <p style={styles.sub}>
          Blue intro → sections wipe in → hold with mild pendulum → scatter.
          Optional background music from the media library.
        </p>
      </header>

      <section style={styles.grid}>
        <div style={styles.panel}>
          <h2 style={styles.h2}>Input image</h2>

          <div style={styles.samples}>
            {POSTER_SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                style={{
                  ...styles.sampleBtn,
                  ...(selectedSample === s.src && !uploadFile
                    ? styles.sampleActive
                    : {}),
                }}
                onClick={() => {
                  setUploadFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                  setPreview(s.src);
                }}
              >
                <img src={s.src} alt={s.name} style={styles.sampleThumb} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>

          <label style={styles.uploadLabel}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
            />
            Upload your own poster
          </label>

          {previewUrl && (
            <img src={previewUrl} alt="Preview" style={styles.preview} />
          )}

          <h2 style={{ ...styles.h2, marginTop: "1.25rem" }}>
            Background music (MP3 / WAV)
          </h2>
          <p style={styles.muted}>
            Tracks from <code style={styles.code}>public/media/music/</code>
          </p>
          <label style={styles.fieldLabel}>
            Select track
            <select
              value={selectedMusicId}
              onChange={(e) => onMusicChange(e.target.value)}
              style={styles.select}
            >
              <option value="">No music</option>
              <optgroup label="MP3">
                {MUSIC_MP3.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="WAV">
                {MUSIC_WAV.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {selectedMusic && (
            <>
              <audio
                ref={musicPreviewRef}
                src={selectedMusic.src}
                controls
                preload="metadata"
                style={styles.musicPreview}
              />
              <label style={styles.timingField}>
                <span>Music volume ({Math.round(musicVolume * 100)}%)</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(Number(e.target.value))}
                  style={styles.rangeInput}
                />
              </label>
            </>
          )}

          <h2 style={{ ...styles.h2, marginTop: "1.25rem" }}>
            Media metadata (tagger)
          </h2>
          <p style={styles.muted}>
            Paste metadata JSON (PascalCase). Only fields present in the JSON
            with values are applied; missing keys keep current values. Embedded
            into the MP4 on export.
          </p>
          <MetadataForm metadata={metadata} onChange={setMetadata} />

          <h2 style={{ ...styles.h2, marginTop: "1.25rem" }}>Timing (seconds)</h2>
          <div style={styles.timingGrid}>
            <TimingField
              label="Blue intro"
              value={timing.blueIntroSeconds}
              min={0.3}
              max={10}
              step={0.1}
              onChange={(v) =>
                setTiming((t) => ({ ...t, blueIntroSeconds: v }))
              }
            />
            <TimingField
              label="Per section reveal"
              value={timing.sectionRevealSeconds}
              min={0.2}
              max={5}
              step={0.05}
              onChange={(v) =>
                setTiming((t) => ({ ...t, sectionRevealSeconds: v }))
              }
            />
            <TimingField
              label="Hold full poster"
              value={timing.holdFullSeconds}
              min={0}
              max={10}
              step={0.1}
              onChange={(v) =>
                setTiming((t) => ({ ...t, holdFullSeconds: v }))
              }
            />
            <label style={styles.timingField}>
              <span>
                Hold pendulum (
                {timing.holdShakeIntensity === 0
                  ? "off"
                  : timing.holdShakeIntensity <= 1
                    ? "mild"
                    : "more"}
                )
              </span>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={timing.holdShakeIntensity}
                onChange={(e) =>
                  setTiming((t) => ({
                    ...t,
                    holdShakeIntensity: Number(e.target.value),
                  }))
                }
                style={styles.rangeInput}
              />
              <span style={styles.sec}>0 = off · 1 = mild · 1.5 = bit more</span>
            </label>
            <TimingField
              label="Scatter outro"
              value={timing.scatterSeconds}
              min={0.3}
              max={8}
              step={0.1}
              onChange={(v) =>
                setTiming((t) => ({ ...t, scatterSeconds: v }))
              }
            />
          </div>

          <label style={styles.fieldLabel}>
            Sections
            <select
              value={
                timing.sectionCount === "auto"
                  ? "auto"
                  : String(timing.sectionCount)
              }
              onChange={(e) => {
                const v = e.target.value;
                setTiming((t) => ({
                  ...t,
                  sectionCount: v === "auto" ? "auto" : Number(v),
                }));
              }}
              style={styles.select}
            >
              <option value="auto">Auto-detect from poster</option>
              {[6, 8, 10, 12, 14].map((n) => (
                <option key={n} value={n}>
                  {n} equal sections
                </option>
              ))}
            </select>
          </label>

          <p style={styles.estimate}>
            Estimated length: ~{estimatedDuration}s (auto uses ~10 sections)
          </p>

          <button
            type="button"
            style={{
              ...styles.generateBtn,
              opacity: busy ? 0.7 : 1,
              cursor: busy ? "wait" : "pointer",
            }}
            disabled={busy}
            onClick={onGenerate}
          >
            {busy ? `Generating MP4… ${progress}%` : "Generate MP4"}
          </button>
          {status && <p style={styles.status}>{status}</p>}
        </div>

        <div style={styles.panel}>
          <h2 style={styles.h2}>Your output</h2>
          {mp4Url ? (
            <>
              <video
                src={mp4Url}
                controls
                autoPlay
                loop
                playsInline
                style={styles.video}
              />
              <div style={styles.downloadRow}>
                <a
                  href={mp4Url}
                  download={filenames.mp4}
                  style={styles.downloadPrimary}
                >
                  Download MP4
                </a>
                <button
                  type="button"
                  style={styles.downloadSecondary}
                  onClick={() =>
                    downloadMetadataJson(metadata, filenames.metadata)
                  }
                >
                  Metadata JSON
                </button>
              </div>
              {sectionCount != null && lastDuration != null && (
                <p style={styles.meta}>
                  {sectionCount} sections · {lastDuration.toFixed(1)}s
                  {selectedMusic ? ` · music: ${selectedMusic.name}` : ""}
                  {metadata.title.trim()
                    ? ` · title: ${metadata.title.trim()}`
                    : ""}
                </p>
              )}
            </>
          ) : canRetryMp4 ? (
            <div style={styles.placeholder}>
              <p>Animation rendered but MP4 encoding did not finish.</p>
              <button
                type="button"
                style={styles.downloadPrimary}
                disabled={busy}
                onClick={retryMp4}
              >
                {busy ? `Encoding MP4… ${progress}%` : "Retry MP4"}
              </button>
            </div>
          ) : (
            <div style={styles.placeholder}>
              <p>Your MP4 will appear here after generation.</p>
              <p style={styles.muted}>
                Use Chrome or Edge. Pick MP3 or WAV music before generating.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function MetadataForm({
  metadata,
  onChange,
}: {
  metadata: VideoMetadata;
  onChange: (m: VideoMetadata) => void;
}) {
  const [jsonText, setJsonText] = useState("");
  const [jsonStatus, setJsonStatus] = useState("");
  const [showFields, setShowFields] = useState(false);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof VideoMetadata, value: string) =>
    onChange({ ...metadata, [key]: value });

  const applyJson = () => {
    try {
      const { metadata: merged, updatedFields } = applyMetadataJson(
        metadata,
        jsonText
      );
      onChange(merged);
      if (updatedFields.length === 0) {
        setJsonStatus(
          "No fields updated — include PascalCase keys with non-empty values."
        );
      } else {
        setJsonStatus(
          `Updated ${updatedFields.length} field(s): ${updatedFields
            .map((k) => METADATA_FIELD_LABELS[k])
            .join(", ")}`
        );
      }
    } catch (e) {
      setJsonStatus(
        e instanceof Error ? e.message : "Invalid JSON — check syntax."
      );
    }
  };

  const loadTemplate = () => {
    setJsonText(JSON.stringify(METADATA_JSON_TEMPLATE, null, 2));
    setJsonStatus("Template loaded — click Apply JSON to merge into metadata.");
  };

  const showCurrentJson = () => {
    setJsonText(JSON.stringify(metadataToExportJson(metadata), null, 2));
    setJsonStatus("Showing current metadata as JSON.");
  };

  const onJsonFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setJsonText(String(reader.result ?? ""));
      setJsonStatus(`Loaded ${file.name} — click Apply JSON.`);
    };
    reader.readAsText(file);
  };

  const fieldKeys = Object.keys(METADATA_FIELD_LABELS) as (keyof VideoMetadata)[];

  return (
    <div style={styles.metadataGrid}>
      <label style={styles.fieldLabel}>
        Metadata JSON
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder='{ "Title": "...", "Tags": "...", "Authors": "..." }'
          rows={10}
          style={styles.jsonTextarea}
        />
      </label>
      <div style={styles.jsonActions}>
        <button type="button" style={styles.jsonBtn} onClick={applyJson}>
          Apply JSON
        </button>
        <button type="button" style={styles.jsonBtn} onClick={loadTemplate}>
          Load template
        </button>
        <button type="button" style={styles.jsonBtn} onClick={showCurrentJson}>
          Show current
        </button>
        <label style={styles.jsonBtn}>
          <input
            ref={jsonFileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              onJsonFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          Import .json file
        </label>
      </div>
      {jsonStatus && <p style={styles.jsonStatus}>{jsonStatus}</p>}

      <button
        type="button"
        style={styles.toggleFields}
        onClick={() => setShowFields((s) => !s)}
      >
        {showFields ? "Hide" : "Show"} manual fields ({fieldKeys.length})
      </button>

      {showFields && (
        <div style={styles.manualFields}>
          {fieldKeys.map((key) => (
            <MetaField
              key={key}
              label={METADATA_FIELD_LABELS[key]}
              value={metadata[key]}
              onChange={(v) => set(key, v)}
              multiline={
                key === "comments" ||
                key === "tags" ||
                key === "keywords"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MetaField({
  label,
  hint,
  value,
  onChange,
  multiline,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      {hint && <span style={styles.hint}>{hint}</span>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          style={styles.textarea}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={styles.textInput}
        />
      )}
    </label>
  );
}

function TimingField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={styles.timingField}>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.numberInput}
      />
      <span style={styles.sec}>sec</span>
    </label>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "2rem 1.25rem 3rem",
  },
  header: { marginBottom: "1.5rem" },
  h1: { margin: 0, fontSize: "1.75rem", fontWeight: 700 },
  sub: { margin: "0.5rem 0 0", color: "var(--muted)", lineHeight: 1.5 },
  code: {
    fontSize: "0.8em",
    background: "#0a1020",
    padding: "0.1em 0.35em",
    borderRadius: 4,
  },
  rangeInput: { width: "100%", marginTop: "0.25rem" },
  musicPreview: {
    width: "100%",
    marginTop: "0.5rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "1.25rem",
  },
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "1.25rem",
  },
  h2: { margin: "0 0 1rem", fontSize: "1.1rem" },
  samples: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  sampleBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem",
    background: "transparent",
    border: "2px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    cursor: "pointer",
    textAlign: "left",
    fontSize: "0.85rem",
  },
  sampleActive: { borderColor: "var(--accent)", background: "#1a2848" },
  sampleThumb: {
    width: 56,
    height: 80,
    objectFit: "cover",
    borderRadius: 4,
    flexShrink: 0,
  },
  uploadLabel: {
    display: "inline-block",
    marginTop: "1rem",
    padding: "0.5rem 1rem",
    border: "1px dashed var(--border)",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: "0.9rem",
    color: "var(--accent)",
  },
  preview: {
    display: "block",
    width: "100%",
    maxHeight: 320,
    objectFit: "contain",
    marginTop: "1rem",
    borderRadius: 8,
    background: "#0a1020",
  },
  timingGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
  },
  timingField: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    fontSize: "0.85rem",
    color: "var(--muted)",
  },
  numberInput: {
    padding: "0.45rem 0.5rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "#0a1020",
    color: "var(--text)",
    width: "100%",
  },
  sec: { fontSize: "0.75rem" },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    marginTop: "0.5rem",
    fontSize: "0.85rem",
    color: "var(--muted)",
  },
  select: {
    padding: "0.45rem 0.5rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "#0a1020",
    color: "var(--text)",
  },
  estimate: {
    marginTop: "0.75rem",
    fontSize: "0.85rem",
    color: "var(--accent)",
  },
  generateBtn: {
    marginTop: "1rem",
    width: "100%",
    padding: "0.75rem 1rem",
    fontSize: "1rem",
    fontWeight: 600,
    color: "#fff",
    background: "var(--accent)",
    border: "none",
    borderRadius: 8,
  },
  status: { marginTop: "0.75rem", fontSize: "0.9rem", color: "var(--muted)" },
  video: {
    width: "100%",
    maxHeight: 480,
    borderRadius: 8,
    background: "#000",
  },
  metadataGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  jsonTextarea: {
    padding: "0.5rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "#0a1020",
    color: "var(--text)",
    width: "100%",
    font: "ui-monospace, monospace",
    fontSize: "0.8rem",
    resize: "vertical",
  },
  jsonActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  jsonBtn: {
    padding: "0.4rem 0.75rem",
    fontSize: "0.8rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "#151d33",
    color: "var(--accent)",
    cursor: "pointer",
  },
  jsonStatus: {
    margin: 0,
    fontSize: "0.8rem",
    color: "var(--accent)",
  },
  toggleFields: {
    padding: "0.35rem 0",
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "0.85rem",
    textAlign: "left",
  },
  manualFields: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    maxHeight: 320,
    overflowY: "auto",
    paddingRight: "0.25rem",
  },
  hint: { fontSize: "0.75rem", opacity: 0.85 },
  textInput: {
    padding: "0.45rem 0.5rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "#0a1020",
    color: "var(--text)",
    width: "100%",
    font: "inherit",
  },
  textarea: {
    padding: "0.45rem 0.5rem",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "#0a1020",
    color: "var(--text)",
    width: "100%",
    font: "inherit",
    resize: "vertical",
  },
  downloadRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginTop: "1rem",
  },
  downloadPrimary: {
    display: "inline-block",
    padding: "0.5rem 1rem",
    background: "var(--accent)",
    color: "#fff",
    borderRadius: 8,
    textDecoration: "none",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  downloadSecondary: {
    display: "inline-block",
    padding: "0.5rem 1rem",
    background: "transparent",
    color: "var(--accent)",
    borderRadius: 8,
    border: "1px solid var(--accent)",
    textDecoration: "none",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  meta: { fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.75rem" },
  placeholder: {
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
    border: "1px dashed var(--border)",
    borderRadius: 8,
    padding: "1rem",
    textAlign: "center",
  },
  muted: { fontSize: "0.85rem", color: "var(--muted)", margin: "0.25rem 0 0" },
};
