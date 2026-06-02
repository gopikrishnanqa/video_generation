import { encodeFfmetadataUtf8 } from "./ffmetadata";
import { toFfmpegMetadataArgs, type VideoMetadata } from "./video-metadata";

const ENCODE_TIMEOUT_MS = 3 * 60 * 1000;

const FFMPEG_JS = "/vendor/ffmpeg/ffmpeg.js";
const CORE_JS = "/vendor/ffmpeg/ffmpeg-core.js";
const CORE_WASM = "/vendor/ffmpeg/ffmpeg-core.wasm";

type FfmpegProgressEvent = { progress: number };
type FfmpegLogEvent = { message: string };

type FFmpegInstance = {
  loaded: boolean;
  load: (config: {
    coreURL: string;
    wasmURL: string;
  }) => Promise<boolean>;
  on: (
    event: "progress" | "log",
    callback: (e: FfmpegProgressEvent | FfmpegLogEvent) => void
  ) => void;
  off: (
    event: "progress" | "log",
    callback: (e: FfmpegProgressEvent | FfmpegLogEvent) => void
  ) => void;
  writeFile: (name: string, data: Uint8Array) => Promise<boolean>;
  readFile: (name: string) => Promise<Uint8Array>;
  exec: (args: string[]) => Promise<number>;
  deleteFile: (name: string) => Promise<boolean>;
  terminate: () => void;
};

declare global {
  interface Window {
    FFmpegWASM?: { FFmpeg: new () => FFmpegInstance };
  }
}

let ffmpegInstance: FFmpegInstance | null = null;
let loadPromise: Promise<FFmpegInstance> | null = null;
let scriptPromise: Promise<void> | null = null;

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

async function assetToBlobUrl(path: string, mimeType: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

function loadFfmpegScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MP4 encoding runs in the browser only"));
  }
  if (window.FFmpegWASM) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${FFMPEG_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load FFmpeg script")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = FFMPEG_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          "Failed to load FFmpeg. Refresh the page or check that /vendor/ffmpeg/ffmpeg.js exists."
        )
      );
    document.head.appendChild(script);
  });

  return scriptPromise;
}

function resetFfmpeg() {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      /* ignore */
    }
  }
  ffmpegInstance = null;
  loadPromise = null;
}

async function getFfmpeg(): Promise<FFmpegInstance> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await loadFfmpegScript();
    const FFmpeg = window.FFmpegWASM?.FFmpeg;
    if (!FFmpeg) {
      throw new Error("FFmpeg library did not initialize");
    }

    const ffmpeg = new FFmpeg();
    const coreURL = await assetToBlobUrl(CORE_JS, "text/javascript");
    const wasmURL = await assetToBlobUrl(CORE_WASM, "application/wasm");

    try {
      await ffmpeg.load({ coreURL, wasmURL });
    } finally {
      URL.revokeObjectURL(coreURL);
      URL.revokeObjectURL(wasmURL);
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (e) {
    resetFfmpeg();
    throw e;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function safeDelete(ffmpeg: FFmpegInstance, name: string) {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    /* ignore */
  }
}

export type Mp4ExportOptions = {
  metadata: VideoMetadata;
  /** Force final MP4 duration to generated animation length (seconds). */
  durationSeconds?: number;
  onProgress?: (pct: number) => void;
  onStatus?: (msg: string) => void;
};

/**
 * Convert WebM → MP4 with metadata embedded for Windows Properties
 * (Title, Subtitle, Rating, Tags, Comments).
 *
 * Pass 1: encode video/audio
 * Pass 2: remux with ffmetadata sidecar (reliable for Explorer Details tab)
 */
export async function convertWebmToMp4(
  webmBlob: Blob,
  options: Mp4ExportOptions
): Promise<Blob> {
  const { metadata, durationSeconds, onProgress, onStatus } = options;
  const trimSeconds =
    typeof durationSeconds === "number" && durationSeconds > 0
      ? durationSeconds.toFixed(3)
      : null;

  onStatus?.("Loading video encoder (first time may take a minute)…");
  onProgress?.(5);

  const ffmpeg = await getFfmpeg();

  const progressHandler = (e: FfmpegProgressEvent | FfmpegLogEvent) => {
    if (!("progress" in e)) return;
    const pct = Math.min(99, Math.round(15 + e.progress * 80));
    onProgress?.(pct);
    onStatus?.(`Encoding MP4… ${pct}%`);
  };
  ffmpeg.on("progress", progressHandler);

  try {
    onProgress?.(10);
    onStatus?.("Rendering MP4 video…");

    await ffmpeg.writeFile("input.webm", await blobToUint8Array(webmBlob));

    await withTimeout(
      ffmpeg.exec([
        "-i",
        "input.webm",
        ...(trimSeconds ? ["-t", trimSeconds] : []),
        "-shortest",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-y",
        "temp.mp4",
      ]),
      ENCODE_TIMEOUT_MS,
      "MP4 encoding timed out after 3 minutes. Try again."
    );

    onProgress?.(55);
    onStatus?.("Writing metadata into MP4 (Windows Properties)…");

    await ffmpeg.writeFile("meta.ffmeta", encodeFfmetadataUtf8(metadata));

    const metaArgs = toFfmpegMetadataArgs(metadata);

    await withTimeout(
      ffmpeg.exec([
        "-i",
        "temp.mp4",
        "-i",
        "meta.ffmeta",
        "-map",
        "0",
        "-map_metadata",
        "1",
        ...(trimSeconds ? ["-t", trimSeconds] : []),
        "-c",
        "copy",
        ...metaArgs,
        "-movflags",
        "+faststart+use_metadata_tags",
        "-y",
        "output.mp4",
      ]),
      ENCODE_TIMEOUT_MS,
      "MP4 metadata pass timed out. Try again."
    );

    onProgress?.(98);
    const data = await ffmpeg.readFile("output.mp4");

    if (data.length < 1000) {
      throw new Error("MP4 output was empty. Encoder may have failed.");
    }

    onProgress?.(100);
    onStatus?.("MP4 ready with embedded metadata");

    const copy = new Uint8Array(data.length);
    copy.set(data);
    return new Blob([copy], { type: "video/mp4" });
  } catch (e) {
    resetFfmpeg();
    throw e;
  } finally {
    ffmpeg.off("progress", progressHandler);
    await safeDelete(ffmpeg, "input.webm");
    await safeDelete(ffmpeg, "temp.mp4");
    await safeDelete(ffmpeg, "meta.ffmeta");
    await safeDelete(ffmpeg, "output.mp4");
  }
}
