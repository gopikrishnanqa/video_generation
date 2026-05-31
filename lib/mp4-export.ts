import { toFfmpegMetadataArgs, type VideoMetadata } from "./video-metadata";

const ENCODE_TIMEOUT_MS = 3 * 60 * 1000;

/** Same-origin paths (see public/vendor/ffmpeg/) — avoids Next.js chunk load failures */
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

export type Mp4ExportOptions = {
  metadata: VideoMetadata;
  onProgress?: (pct: number) => void;
  onStatus?: (msg: string) => void;
};

/** Convert WebM blob to H.264 MP4 with embedded metadata tags. */
export async function convertWebmToMp4(
  webmBlob: Blob,
  options: Mp4ExportOptions
): Promise<Blob> {
  const { metadata, onProgress, onStatus } = options;

  onStatus?.("Loading video encoder (first time may take a minute)…");
  onProgress?.(5);

  const ffmpeg = await getFfmpeg();

  const progressHandler = (e: FfmpegProgressEvent | FfmpegLogEvent) => {
    if (!("progress" in e)) return;
    const pct = Math.min(99, Math.round(20 + e.progress * 75));
    onProgress?.(pct);
    onStatus?.(`Encoding MP4… ${pct}%`);
  };
  ffmpeg.on("progress", progressHandler);

  try {
    onProgress?.(12);
    onStatus?.("Preparing conversion…");

    await ffmpeg.writeFile("input.webm", await blobToUint8Array(webmBlob));

    const metaArgs = toFfmpegMetadataArgs(metadata);

    onProgress?.(18);
    onStatus?.("Encoding MP4 (H.264 + AAC)…");

    await withTimeout(
      ffmpeg.exec([
        "-i",
        "input.webm",
        ...metaArgs,
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
        "output.mp4",
      ]),
      ENCODE_TIMEOUT_MS,
      "MP4 encoding timed out after 3 minutes. Try again."
    );

    onProgress?.(98);
    const data = await ffmpeg.readFile("output.mp4");

    if (data.length < 1000) {
      throw new Error("MP4 output was empty. Encoder may have failed.");
    }

    onProgress?.(100);
    onStatus?.("MP4 ready");

    const copy = new Uint8Array(data.length);
    copy.set(data);
    return new Blob([copy], { type: "video/mp4" });
  } catch (e) {
    resetFfmpeg();
    throw e;
  } finally {
    ffmpeg.off("progress", progressHandler);
    try {
      await ffmpeg.deleteFile("input.webm");
      await ffmpeg.deleteFile("output.mp4");
    } catch {
      /* ignore cleanup errors */
    }
  }
}
