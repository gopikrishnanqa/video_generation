import type { Section } from "./section-detector";

export type ImageLayout = {
  offsetX: number;
  offsetY: number;
  drawW: number;
  drawH: number;
  scale: number;
};

export function computeImageLayout(
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number
): ImageLayout {
  const scale = Math.min(canvasW / imgW, canvasH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  return {
    offsetX: (canvasW - drawW) / 2,
    offsetY: (canvasH - drawH) / 2,
    drawW,
    drawH,
    scale,
  };
}

export function sectionToDisplay(
  section: Section,
  layout: ImageLayout
): { y: number; height: number } {
  return {
    y: layout.offsetY + section.y * layout.scale,
    height: section.height * layout.scale,
  };
}
