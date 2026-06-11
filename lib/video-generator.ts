import { computeHoldShake } from "./hold-shake";
import { createMusicRecorder } from "./music-recorder";
import {
  computeImageLayout,
  sectionToDisplay,
  type ImageLayout,
} from "./layout";
import {
  detectSections,
  sectionsForCount,
  type Section,
} from "./section-detector";

export type IntroStyle = "blue" | "blur";

export type GenerateOptions = {
  fps?: number;
  width?: number;
  height?: number;
  /** Blue wash over poster, or heavy blur with little color tint */
  introStyle?: IntroStyle;
  blueIntroSeconds?: number;
  sectionRevealSeconds?: number;
  holdFullSeconds?: number;
  scatterSeconds?: number;
  /** Optional image shown after scatter outro. */
  endCardSrc?: string | null;
  endCardSeconds?: number;
  sectionCount?: number | "auto";
  /** 0 = off, 1 = mild pendulum (default), up to 1.5 for slightly more sway */
  holdShakeIntensity?: number;
  /** URL to MP3 under /media/music — mixed into output */
  musicSrc?: string | null;
  musicVolume?: number;
  onProgress?: (pct: number) => void;
};

export type GenerateResult = {
  blob: Blob;
  mimeType: string;
  sections: Section[];
  durationSeconds: number;
};

const BLUE = { r: 20, g: 60, b: 150 };

type Particle = {
  ix: number;
  iy: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  vx: number;
  vy: number;
  rot0: number;
  vr: number;
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadImage(src: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => reject(new Error("Failed to load image"));
    if (typeof src === "string") {
      img.onload = () => resolve(img);
      img.src = src;
    } else {
      const url = URL.createObjectURL(src);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.src = url;
    }
  });
}

function drawFullImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  layout: ImageLayout
) {
  ctx.drawImage(
    img,
    0,
    0,
    img.naturalWidth,
    img.naturalHeight,
    layout.offsetX,
    layout.offsetY,
    layout.drawW,
    layout.drawH
  );
}

function drawBlueOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alpha: number
) {
  ctx.fillStyle = `rgba(${BLUE.r},${BLUE.g},${BLUE.b},${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

/** Fade poster out near intro end so section reveal starts from masked state. */
function introPosterFade(progress: number): number {
  const t = easeOutCubic(progress);
  if (t <= 0.55) return 1;
  return 1 - easeOutCubic((t - 0.55) / 0.45);
}

/** Blue color wash — poster faint under strong blue overlay */
function drawBlueIntro(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  layout: ImageLayout,
  progress: number
) {
  const t = easeOutCubic(progress);
  const posterFade = introPosterFade(progress);
  ctx.fillStyle = "#060d18";
  ctx.fillRect(0, 0, cw, ch);

  const imageAlpha = (0.22 + t * 0.28) * posterFade;
  if (imageAlpha > 0.02) {
    const blurPx = 6 * (1 - t) * posterFade;
    ctx.save();
    ctx.filter = blurPx > 0.5 ? `blur(${blurPx}px)` : "none";
    ctx.globalAlpha = imageAlpha;
    drawFullImage(ctx, img, layout);
    ctx.restore();
  }

  const blueAlpha = Math.min(0.95, 0.92 - t * 0.2 + (1 - posterFade) * 0.35);
  drawBlueOverlay(ctx, cw, ch, blueAlpha);
}

/** Blur focus — poster stays blurred; never ends on a sharp full image */
function drawBlurIntro(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  layout: ImageLayout,
  progress: number
) {
  const t = easeOutCubic(progress);
  const posterFade = introPosterFade(progress);
  ctx.fillStyle = "#060d18";
  ctx.fillRect(0, 0, cw, ch);

  const imageAlpha = (0.4 + t * 0.35) * posterFade;
  if (imageAlpha > 0.02) {
    const blurPx = Math.max(8, 22 * posterFade);
    ctx.save();
    ctx.filter = `blur(${blurPx}px)`;
    ctx.globalAlpha = imageAlpha;
    drawFullImage(ctx, img, layout);
    ctx.restore();
  }

  const blueAlpha = 0.1 * (1 - t) * posterFade + (1 - posterFade) * 0.9;
  if (blueAlpha > 0.01) {
    drawBlueOverlay(ctx, cw, ch, blueAlpha);
  }
}

function drawIntro(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  layout: ImageLayout,
  progress: number,
  style: IntroStyle
) {
  if (style === "blur") {
    drawBlurIntro(ctx, img, cw, ch, layout, progress);
  } else {
    drawBlueIntro(ctx, img, cw, ch, layout, progress);
  }
}

function drawSectionReveal(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  layout: ImageLayout,
  sections: Section[],
  revealedCount: number,
  sectionAnim: number
) {
  ctx.fillStyle = "#060d18";
  ctx.fillRect(0, 0, cw, ch);

  const imgW = img.naturalWidth;
  const posterBottom = layout.offsetY + layout.drawH;
  let visibleBottom = layout.offsetY;

  for (let i = 0; i <= revealedCount && i < sections.length; i++) {
    const s = sections[i];
    const d = sectionToDisplay(s, layout);

    if (i < revealedCount) {
      ctx.drawImage(
        img,
        0,
        s.y,
        imgW,
        s.height,
        layout.offsetX,
        d.y,
        layout.drawW,
        d.height
      );
      visibleBottom = d.y + d.height;
    } else {
      const t = easeOutCubic(sectionAnim);
      const clipH = d.height * t;
      ctx.save();
      ctx.beginPath();
      ctx.rect(layout.offsetX, d.y, layout.drawW, clipH);
      ctx.clip();
      ctx.drawImage(
        img,
        0,
        s.y,
        imgW,
        s.height,
        layout.offsetX,
        d.y,
        layout.drawW,
        d.height
      );
      ctx.restore();
      visibleBottom = d.y + clipH;
    }
  }

  if (visibleBottom < posterBottom) {
    ctx.fillStyle = `rgba(${BLUE.r},${BLUE.g},${BLUE.b},0.92)`;
    ctx.fillRect(0, visibleBottom, cw, posterBottom - visibleBottom);
  }

  if (posterBottom < ch) {
    ctx.fillStyle = "#060d18";
    ctx.fillRect(0, posterBottom, cw, ch - posterBottom);
  }
}

function drawFullPoster(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  layout: ImageLayout,
  shake?: { rotationDeg: number; pivotFromTop: boolean }
) {
  ctx.fillStyle = "#060d18";
  ctx.fillRect(0, 0, cw, ch);

  if (!shake || shake.rotationDeg === 0) {
    drawFullImage(ctx, img, layout);
    return;
  }

  const rad = (shake.rotationDeg * Math.PI) / 180;

  if (shake.pivotFromTop) {
    const pivotX = layout.offsetX + layout.drawW / 2;
    const pivotY = layout.offsetY;
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(rad);
    ctx.drawImage(
      img,
      0,
      0,
      img.naturalWidth,
      img.naturalHeight,
      -layout.drawW / 2,
      0,
      layout.drawW,
      layout.drawH
    );
    ctx.restore();
    return;
  }

  const cx = layout.offsetX + layout.drawW / 2;
  const cy = layout.offsetY + layout.drawH / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);
  ctx.drawImage(
    img,
    0,
    0,
    img.naturalWidth,
    img.naturalHeight,
    -layout.drawW / 2,
    -layout.drawH / 2,
    layout.drawW,
    layout.drawH
  );
  ctx.restore();
}

function buildParticles(
  composite: HTMLCanvasElement,
  cw: number,
  ch: number,
  cols: number,
  rows: number
): Particle[] {
  const particles: Particle[] = [];
  const cellW = cw / cols;
  const cellH = ch / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellW + cellW / 2;
      const y = row * cellH + cellH / 2;
      const angle = Math.atan2(y - ch / 2, x - cw / 2);
      const dist = Math.hypot(x - cw / 2, y - ch / 2);
      const speed = 6 + Math.random() * 14 + dist * 0.03;
      particles.push({
        ix: x,
        iy: y,
        sx: col * cellW,
        sy: row * cellH,
        sw: cellW + 2,
        sh: cellH + 2,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 6,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 6 - 3,
        rot0: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.25,
      });
    }
  }
  return particles;
}

function drawScatter(
  ctx: CanvasRenderingContext2D,
  composite: HTMLCanvasElement,
  cw: number,
  ch: number,
  particles: Particle[],
  progress: number
) {
  ctx.fillStyle = "#060d18";
  ctx.fillRect(0, 0, cw, ch);

  const fade = 1 - easeInOutQuad(progress);
  const spread = progress * progress;

  for (const p of particles) {
    const x = p.ix + p.vx * spread * 18;
    const y = p.iy + p.vy * spread * 18;
    const rot = p.rot0 + p.vr * spread * 40;

    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(
      composite,
      p.sx,
      p.sy,
      p.sw,
      p.sh,
      -p.sw / 2,
      -p.sh / 2,
      p.sw,
      p.sh
    );
    ctx.restore();
  }

  if (progress > 0.55) {
    const fadeBg = (progress - 0.55) / 0.45;
    ctx.fillStyle = `rgba(6, 13, 24, ${fadeBg})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}

function drawEndCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
  progress: number
) {
  const layout = computeImageLayout(img.naturalWidth, img.naturalHeight, cw, ch);
  const t = easeOutCubic(progress);
  ctx.fillStyle = "#060d18";
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.2 + t * 0.9);
  drawFullImage(ctx, img, layout);
  ctx.restore();
}

function pickMimeType(withAudio: boolean): string {
  const types = withAudio
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm",
      ]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

type VideoTrackWithFrame = MediaStreamTrack & { requestFrame?: () => void };

export async function generatePosterVideo(
  source: string | File,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const fps = options.fps ?? 30;
  const outW = options.width ?? 1080;
  const outH = options.height ?? 1920;
  const introStyle: IntroStyle = options.introStyle ?? "blue";
  const blueIntro = Math.max(0.3, options.blueIntroSeconds ?? 1.5);
  const sectionReveal = Math.max(0.2, options.sectionRevealSeconds ?? 0.6);
  const holdFull = Math.max(0, options.holdFullSeconds ?? 1);
  const scatterDur = Math.max(0.3, options.scatterSeconds ?? 2);
  const endCardSeconds = Math.max(0, options.endCardSeconds ?? 0);
  const holdShakeIntensity =
    options.holdShakeIntensity === undefined
      ? 1
      : Math.max(0, Math.min(1.5, options.holdShakeIntensity));

  const img = await loadImage(source);
  const endCardImg =
    options.endCardSrc && endCardSeconds > 0
      ? await loadImage(options.endCardSrc)
      : null;
  const layout = computeImageLayout(
    img.naturalWidth,
    img.naturalHeight,
    outW,
    outH
  );

  const analysis = document.createElement("canvas");
  analysis.width = img.naturalWidth;
  analysis.height = img.naturalHeight;
  const actx = analysis.getContext("2d")!;
  actx.drawImage(img, 0, 0);

  let sections: Section[];
  if (options.sectionCount === "auto" || options.sectionCount == null) {
    sections = detectSections(
      actx.getImageData(0, 0, analysis.width, analysis.height)
    );
  } else {
    sections = sectionsForCount(img.naturalHeight, options.sectionCount);
  }

  const introFrames = Math.max(1, Math.round(blueIntro * fps));
  const sectionFrames = Math.max(1, Math.round(sectionReveal * fps));
  const holdFrames = Math.max(0, Math.round(holdFull * fps));
  const scatterFrames = Math.max(1, Math.round(scatterDur * fps));
  const endCardFrames =
    endCardImg && endCardSeconds > 0 ? Math.max(1, Math.round(endCardSeconds * fps)) : 0;
  const totalFrames =
    introFrames +
    sections.length * sectionFrames +
    holdFrames +
    scatterFrames +
    endCardFrames;

  const durationSeconds = totalFrames / fps;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const ctx = outCanvas.getContext("2d", { alpha: false })!;

  const composite = document.createElement("canvas");
  composite.width = outW;
  composite.height = outH;
  const cctx = composite.getContext("2d")!;
  drawFullPoster(cctx, img, outW, outH, layout);

  const particles = buildParticles(composite, outW, outH, 40, 52);

  const musicSrc = options.musicSrc?.trim() || null;
  const musicVolume = options.musicVolume ?? 0.85;
  let musicHandle: Awaited<ReturnType<typeof createMusicRecorder>> | null =
    null;
  if (musicSrc) {
    musicHandle = await createMusicRecorder(musicSrc, musicVolume);
  }

  const mimeType = pickMimeType(!!musicHandle);

  const videoStream = outCanvas.captureStream(0);
  const track = videoStream.getVideoTracks()[0] as VideoTrackWithFrame;

  const recordTracks = [...videoStream.getVideoTracks()];
  if (musicHandle) {
    recordTracks.push(...musicHandle.audioStream.getAudioTracks());
  }
  const recordStream = new MediaStream(recordTracks);

  const recorder = new MediaRecorder(recordStream, {
    mimeType,
    videoBitsPerSecond: 10_000_000,
    audioBitsPerSecond: musicHandle ? 192_000 : undefined,
  });
  const chunks: Blob[] = [];

  const blobPromise = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error("Recording failed"));
  });

  recorder.start();
  if (musicHandle) await musicHandle.start();

  const frameMs = 1000 / fps;

  for (let frame = 0; frame < totalFrames; frame++) {
    if (frame < introFrames) {
      drawIntro(
        ctx,
        img,
        outW,
        outH,
        layout,
        frame / introFrames,
        introStyle
      );
    } else if (frame < introFrames + sections.length * sectionFrames) {
      const local = frame - introFrames;
      const sectionIdx = Math.floor(local / sectionFrames);
      const anim = (local % sectionFrames) / sectionFrames;
      drawSectionReveal(
        ctx,
        img,
        outW,
        outH,
        layout,
        sections,
        sectionIdx,
        anim
      );
    } else if (frame < introFrames + sections.length * sectionFrames + holdFrames) {
      const holdStart =
        introFrames + sections.length * sectionFrames;
      const holdFrame = frame - holdStart;
      const shake =
        holdFrames > 0
          ? computeHoldShake(holdFrame, fps, holdShakeIntensity)
          : undefined;
      drawFullPoster(ctx, img, outW, outH, layout, shake);
    } else {
      const local =
        frame - introFrames - sections.length * sectionFrames - holdFrames;
      if (local < scatterFrames) {
        drawScatter(ctx, composite, outW, outH, particles, local / scatterFrames);
      } else if (endCardImg) {
        const endLocal = local - scatterFrames;
        drawEndCard(
          ctx,
          endCardImg,
          outW,
          outH,
          endCardFrames > 0 ? endLocal / endCardFrames : 1
        );
      } else {
        ctx.fillStyle = "#060d18";
        ctx.fillRect(0, 0, outW, outH);
      }
    }

    track.requestFrame?.();
    options.onProgress?.(
      Math.min(100, Math.round(((frame + 1) / totalFrames) * 100))
    );
    await sleep(frameMs);
  }

  await sleep(200);
  recorder.stop();
  musicHandle?.stop();
  const blob = await blobPromise;

  return { blob, mimeType, sections, durationSeconds };
}
