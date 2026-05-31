function musicPath(filename: string): string {
  return `/media/music/${encodeURIComponent(filename)}`;
}

function refVideoPath(filename: string): string {
  return `/media/reference-videos/${encodeURIComponent(filename)}`;
}

export type MusicTrack = {
  id: string;
  name: string;
  src: string;
  format: "mp3" | "wav";
};

export type ReferenceVideo = {
  id: string;
  label: string;
  src: string;
};

/** Poster images stay in /samples */
export const POSTER_SAMPLES = [
  {
    id: "echs",
    name: "ECHS Madhya Pradesh Recruitment",
    src: "/samples/echs-recruitment.png",
  },
  {
    id: "upsssc",
    name: "UPSSSC Pollution Control Board Exam",
    src: "/samples/upsssc-exam.png",
  },
] as const;

const MP3_TRACKS: MusicTrack[] = [
  { id: "01-main", name: "01 Main", src: musicPath("01_main.mp3"), format: "mp3" },
  {
    id: "sunrise-mood",
    name: "Sunrise Mood",
    src: musicPath("AlexanderRufire_Sunrise-Mood_Main.mp3"),
    format: "mp3",
  },
  {
    id: "energy-rock-mp3",
    name: "Energy Rock",
    src: musicPath("Energy Rock.mp3"),
    format: "mp3",
  },
  {
    id: "urban-godzilla",
    name: "Main [1.11] — Urban Godzilla",
    src: musicPath("Main [1.11] by Urban Godzilla.mp3"),
    format: "mp3",
  },
  {
    id: "mp3-v1",
    name: "MP3 version 1",
    src: musicPath("mp3 version 1.mp3"),
    format: "mp3",
  },
  {
    id: "mp3-v2",
    name: "MP3 version 2",
    src: musicPath("mp3 version 2.mp3"),
    format: "mp3",
  },
  {
    id: "mp3-v3",
    name: "MP3 version 3",
    src: musicPath("mp3 version 3.mp3"),
    format: "mp3",
  },
  {
    id: "aggressive-sport-mp3",
    name: "Aggressive Sport Electro",
    src: musicPath("MP3_AGRESSIVE_SPORT_ELECTRO.mp3"),
    format: "mp3",
  },
];

const WAV_TRACKS: MusicTrack[] = [
  {
    id: "01-main-wav",
    name: "01 Main (WAV)",
    src: musicPath("01_main.wav"),
    format: "wav",
  },
  {
    id: "energy-rock-wav",
    name: "Energy Rock (WAV)",
    src: musicPath("Energy Rock.wav"),
    format: "wav",
  },
  {
    id: "rock-energy-wav",
    name: "Rock Energy (WAV)",
    src: musicPath("Rock Energy.wav"),
    format: "wav",
  },
  {
    id: "urban-sunrise-wav",
    name: "Urban Sunrise (full WAV)",
    src: musicPath("urban-sunrise_main-full.wav"),
    format: "wav",
  },
  {
    id: "aggressive-sport-wav",
    name: "Aggressive Sport Electro (WAV)",
    src: musicPath("WAV_AGRESSIVE_SPORT_ELECTRO.wav"),
    format: "wav",
  },
];

/** MP3 & WAV in public/media/music */
export const MUSIC_TRACKS: MusicTrack[] = [...MP3_TRACKS, ...WAV_TRACKS];

export const MUSIC_MP3 = MP3_TRACKS;
export const MUSIC_WAV = WAV_TRACKS;

/** Reference MP4s in public/media/reference-videos */
export const REFERENCE_VIDEOS: ReferenceVideo[] = [
  {
    id: "grok",
    label: "Grok reference",
    src: refVideoPath("grok-reference.mp4"),
  },
  {
    id: "echs",
    label: "ECHS reference (pendulum hold)",
    src: refVideoPath("echs-reference.mp4"),
  },
];
