import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

type EndCardItem = {
  id: string;
  name: string;
  src: string;
};

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function collectImagesRecursive(
  dir: string,
  rootPublic: string,
  out: EndCardItem[]
) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectImagesRecursive(abs, rootPublic, out);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;

    const rel = path.relative(rootPublic, abs).split(path.sep).join("/");
    out.push({
      id: rel.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: path.basename(entry.name, path.extname(entry.name)),
      src: `/${rel}`,
    });
  }
}

export async function GET() {
  const publicDir = path.join(process.cwd(), "public");
  const mediaDir = path.join(publicDir, "media");
  const out: EndCardItem[] = [];

  try {
    await collectImagesRecursive(mediaDir, publicDir, out);
  } catch {
    return NextResponse.json({ items: [] as EndCardItem[] });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ items: out });
}
