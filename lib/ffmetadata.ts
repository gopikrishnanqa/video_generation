import type { VideoMetadata } from "./video-metadata";

function clean(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

/** Windows star rating (1–5) → System.Rating scale (1, 25, 50, 75, 99). */
export function toWindowsRating(rating: string): string {
  const v = clean(rating);
  if (!v) return "";
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return v;
  const map: Record<number, number> = { 1: 1, 2: 25, 3: 50, 4: 75, 5: 99 };
  if (n >= 1 && n <= 5) return String(map[n]);
  if (n >= 0 && n <= 99) return String(n);
  return "99";
}

/** Windows Tags field prefers semicolon-separated keywords. */
export function toWindowsTags(meta: VideoMetadata): string {
  const parts = [meta.tags, meta.keywords]
    .filter((s) => clean(s))
    .flatMap((s) => s.split(/[,;]/))
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(parts)].join(";");
}

function escapeFfmeta(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, " ")
    .replace(/#/g, "\\#")
    .replace(/;/g, "\\;")
    .replace(/=/g, "\\=");
}

function line(key: string, value: string, lines: string[]) {
  const v = clean(value);
  if (v) lines.push(`${key}=${escapeFfmeta(v)}`);
}

/**
 * FFMETADATA sidecar for FFmpeg `-map_metadata`.
 * Writes QuickTime/Windows-friendly tags (Title, Subtitle, Rating, Tags, Comments).
 */
export function buildFfmetadataContent(meta: VideoMetadata): string {
  const lines = [";FFMETADATA1"];

  line("title", meta.title, lines);
  line("subtitle", meta.subtitle, lines);
  line("comment", meta.comments, lines);
  line(
    "description",
    [meta.title, meta.subtitle, meta.comments].filter((s) => clean(s)).join(" — "),
    lines
  );
  line("keywords", toWindowsTags(meta), lines);
  line("rating", toWindowsRating(meta.rating), lines);

  line("artist", meta.author, lines);
  line("album_artist", meta.publisher, lines);
  line("publisher", meta.publisher, lines);
  line("copyright", meta.copyright, lines);
  line("genre", meta.category, lines);
  line("subject", meta.subject, lines);
  line("language", meta.language, lines);
  line("encoded_by", meta.company, lines);
  line("composer", meta.manager, lines);
  line("synopsis", meta.comments, lines);
  line("website", meta.source, lines);

  return lines.join("\n") + "\n";
}

export function encodeFfmetadataUtf8(meta: VideoMetadata): Uint8Array {
  return new TextEncoder().encode(buildFfmetadataContent(meta));
}
