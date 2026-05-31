export type MusicRecorderHandle = {
  audioStream: MediaStream;
  start: () => Promise<void>;
  stop: () => void;
};

/** Capture MP3 or WAV into a MediaStream for MediaRecorder (loops if shorter than video). */
export async function createMusicRecorder(
  musicSrc: string,
  volume = 0.85
): Promise<MusicRecorderHandle> {
  const audio = new Audio(musicSrc);
  audio.crossOrigin = "anonymous";
  audio.loop = true;
  audio.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener(
      "error",
      () => reject(new Error("Failed to load music track")),
      { once: true }
    );
    audio.load();
  });

  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(audio);
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume));
  const dest = ctx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(dest);

  return {
    audioStream: dest.stream,
    start: async () => {
      if (ctx.state === "suspended") await ctx.resume();
      audio.currentTime = 0;
      await audio.play();
    },
    stop: () => {
      audio.pause();
      source.disconnect();
      gain.disconnect();
      void ctx.close();
    },
  };
}
