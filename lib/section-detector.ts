export type Section = { y: number; height: number };

/** Detect horizontal bands separated by light grey divider lines (job poster layout). */
export function detectSections(
  imageData: ImageData,
  minSectionHeight = 40
): Section[] {
  const { width, height, data } = imageData;
  const rowScore: number[] = new Array(height).fill(0);

  for (let y = 0; y < height; y++) {
    let dividerPixels = 0;
    const samples = 32;
    for (let i = 0; i < samples; i++) {
      const x = Math.floor((i / samples) * (width - 1));
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (lum > 195 && sat < 0.14) dividerPixels++;
    }
    rowScore[y] = dividerPixels / samples;
  }

  const isDivider = rowScore.map((s) => s > 0.5);
  const sections: Section[] = [];
  let start = 0;
  let inContent = false;

  for (let y = 0; y < height; y++) {
    if (!isDivider[y]) {
      if (!inContent) {
        start = y;
        inContent = true;
      }
    } else if (inContent) {
      const h = y - start;
      if (h >= minSectionHeight) sections.push({ y: start, height: h });
      inContent = false;
    }
  }
  if (inContent) {
    const h = height - start;
    if (h >= minSectionHeight) sections.push({ y: start, height: h });
  }

  if (sections.length < 3) {
    return fallbackSections(height, 10);
  }

  return mergeTinySections(sections, minSectionHeight);
}

export function sectionsForCount(imageHeight: number, count: number): Section[] {
  return fallbackSections(imageHeight, Math.max(3, Math.min(20, count)));
}

function mergeTinySections(sections: Section[], minH: number): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    if (s.height < minH && out.length > 0) {
      const prev = out[out.length - 1];
      prev.height += s.height;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function fallbackSections(height: number, count: number): Section[] {
  const h = Math.floor(height / count);
  return Array.from({ length: count }, (_, i) => ({
    y: i * h,
    height: i === count - 1 ? height - i * h : h,
  }));
}
