import { metadataToJson, slugFromTitle, type VideoMetadata } from "./video-metadata";

export function revokeIfBlobUrl(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function buildFilenames(meta: VideoMetadata) {
  const slug = slugFromTitle(meta.title);
  const stamp = Date.now();
  return {
    mp4: `${slug}-${stamp}.mp4`,
    metadata: `${slug}-${stamp}-metadata.json`,
  };
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadMetadataJson(meta: VideoMetadata, filename: string) {
  triggerDownload(
    new Blob([metadataToJson(meta)], { type: "application/json" }),
    filename
  );
}
