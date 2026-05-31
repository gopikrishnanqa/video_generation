/** Full metadata model (form + MP4 tags + JSON import/export). */
export type VideoMetadata = {
  title: string;
  subtitle: string;
  rating: string;
  tags: string;
  comments: string;
  author: string;
  copyright: string;
  publisher: string;
  category: string;
  subject: string;
  keywords: string;
  source: string;
  company: string;
  manager: string;
  contentStatus: string;
  language: string;
};

/** JSON file format (PascalCase) — matches your metadata template. */
export type VideoMetadataJson = {
  Title?: string;
  Subtitle?: string;
  Rating?: string;
  Tags?: string;
  Comments?: string;
  Authors?: string;
  Copyright?: string;
  Publisher?: string;
  Category?: string;
  Subject?: string;
  Keywords?: string;
  Source?: string;
  Company?: string;
  Manager?: string;
  ContentStatus?: string;
  Language?: string;
};

export const METADATA_JSON_TEMPLATE: VideoMetadataJson = {
  Title: "UPSSSC Pollution Control Board Exam Date 2026 Out",
  Subtitle: "Written Exam on 29 June 2026",
  Rating: "5",
  Tags: "UPSSSC, Government Jobs, Sarkari Job, Exam Date 2026",
  Comments:
    "For more details visit SarkariNetworkJob.com. For educational purposes only. Check official notification.",
  Authors: "SarkariNetworkJob",
  Copyright: "SarkariNetworkJob.com",
  Publisher: "SarkariNetworkJob",
  Category: "Education",
  Subject: "Government Job Notification",
  Keywords: "UPSSSC Recruitment 2026, Government Jobs, Job Alert",
  Source: "https://upsssc.gov.in/",
  Company: "SarkariNetworkJob",
  Manager: "SarkariNetworkJob",
  ContentStatus: "Final",
  Language: "English",
};

export const DEFAULT_VIDEO_METADATA: VideoMetadata = {
  title: "",
  subtitle: "",
  rating: "",
  tags: "",
  comments: "",
  author: "SarkariNetworkJob",
  copyright: "SarkariNetworkJob.com",
  publisher: "SarkariNetworkJob",
  category: "Education",
  subject: "Government Job Notification",
  keywords: "government jobs, recruitment, sarkari naukri",
  source: "https://sarkarinetworkjob.com",
  company: "SarkariNetworkJob",
  manager: "SarkariNetworkJob",
  contentStatus: "Final",
  language: "English",
};

const JSON_TO_INTERNAL: Record<keyof VideoMetadataJson, keyof VideoMetadata> = {
  Title: "title",
  Subtitle: "subtitle",
  Rating: "rating",
  Tags: "tags",
  Comments: "comments",
  Authors: "author",
  Copyright: "copyright",
  Publisher: "publisher",
  Category: "category",
  Subject: "subject",
  Keywords: "keywords",
  Source: "source",
  Company: "company",
  Manager: "manager",
  ContentStatus: "contentStatus",
  Language: "language",
};

const INTERNAL_TO_JSON: Record<keyof VideoMetadata, keyof VideoMetadataJson> =
  Object.fromEntries(
    Object.entries(JSON_TO_INTERNAL).map(([j, i]) => [i, j])
  ) as Record<keyof VideoMetadata, keyof VideoMetadataJson>;

const INTERNAL_ALIASES: Record<string, keyof VideoMetadata> = {
  title: "title",
  subtitle: "subtitle",
  rating: "rating",
  tags: "tags",
  comments: "comments",
  comment: "comments",
  description: "comments",
  author: "author",
  authors: "author",
  artist: "author",
  copyright: "copyright",
  publisher: "publisher",
  category: "category",
  subject: "subject",
  keywords: "keywords",
  source: "source",
  website: "source",
  company: "company",
  organization: "company",
  manager: "manager",
  contentstatus: "contentStatus",
  content_status: "contentStatus",
  language: "language",
};

export const METADATA_FIELD_LABELS: Record<keyof VideoMetadata, string> = {
  title: "Title",
  subtitle: "Subtitle",
  rating: "Rating",
  tags: "Tags",
  comments: "Comments",
  author: "Authors",
  copyright: "Copyright",
  publisher: "Publisher",
  category: "Category",
  subject: "Subject",
  keywords: "Keywords",
  source: "Source",
  company: "Company",
  manager: "Manager",
  contentStatus: "ContentStatus",
  language: "Language",
};

function clean(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

function resolveInternalKey(key: string): keyof VideoMetadata | null {
  if (key in JSON_TO_INTERNAL) {
    return JSON_TO_INTERNAL[key as keyof VideoMetadataJson];
  }
  const alias = INTERNAL_ALIASES[key.toLowerCase().replace(/\s+/g, "")];
  if (alias) return alias;
  const alias2 = INTERNAL_ALIASES[key.toLowerCase()];
  return alias2 ?? null;
}

/**
 * Parse metadata JSON. Only keys present with non-empty values are returned.
 * Missing keys are omitted so merge won't overwrite existing values.
 */
export function parseMetadataJson(text: string): Partial<VideoMetadata> {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const partial: Partial<VideoMetadata> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!isPresent(value)) continue;
    const internal = resolveInternalKey(key);
    if (internal) {
      partial[internal] = String(value).trim();
    }
  }

  return partial;
}

export type MergeMetadataResult = {
  metadata: VideoMetadata;
  updatedFields: (keyof VideoMetadata)[];
};

/** Apply only fields present in partial; leave others unchanged. */
export function mergeMetadata(
  current: VideoMetadata,
  partial: Partial<VideoMetadata>
): MergeMetadataResult {
  const next = { ...current };
  const updatedFields: (keyof VideoMetadata)[] = [];

  for (const [key, value] of Object.entries(partial) as [
    keyof VideoMetadata,
    string,
  ][]) {
    if (value !== undefined && isPresent(value)) {
      next[key] = value.trim();
      updatedFields.push(key);
    }
  }

  return { metadata: next, updatedFields };
}

export function applyMetadataJson(
  current: VideoMetadata,
  jsonText: string
): MergeMetadataResult {
  const partial = parseMetadataJson(jsonText);
  return mergeMetadata(current, partial);
}

export function metadataToExportJson(meta: VideoMetadata): VideoMetadataJson {
  const out: VideoMetadataJson = {};
  for (const key of Object.keys(meta) as (keyof VideoMetadata)[]) {
    const v = clean(meta[key]);
    if (v) {
      out[INTERNAL_TO_JSON[key]] = v;
    }
  }
  return out;
}

export function metadataToJson(meta: VideoMetadata): string {
  return JSON.stringify(
    {
      ...metadataToExportJson(meta),
      taggedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

export function metadataHasContent(meta: VideoMetadata): boolean {
  return Object.values(meta).some((v) => v.trim().length > 0);
}

/** FFmpeg `-metadata key=value` argument pairs */
export function toFfmpegMetadataArgs(meta: VideoMetadata): string[] {
  const args: string[] = [];
  const keywordBlob = [meta.keywords, meta.tags].filter((s) => clean(s)).join(", ");
  const description = [meta.title, meta.subtitle, meta.comments]
    .filter((s) => clean(s))
    .join(" — ");

  const map: [string, string][] = [
    ["title", meta.title],
    ["subtitle", meta.subtitle],
    ["description", description],
    ["comment", meta.comments],
    ["artist", meta.author],
    ["album_artist", meta.publisher],
    ["publisher", meta.publisher],
    ["copyright", meta.copyright],
    ["genre", meta.category],
    ["subject", meta.subject],
    ["keywords", keywordBlob],
    ["language", meta.language],
    ["rating", meta.rating],
    ["website", meta.source],
    ["encoded_by", meta.company],
    ["composer", meta.manager],
    ["content_status", meta.contentStatus],
  ];

  for (const [key, value] of map) {
    const v = clean(value);
    if (v) args.push("-metadata", `${key}=${v}`);
  }

  return args;
}

export function slugFromTitle(title: string): string {
  const base = title.trim() || "poster-video";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
