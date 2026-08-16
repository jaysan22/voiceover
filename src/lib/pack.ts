export type Character = {
  id: string;
  name: string;
  color: string;
};

export type WordTiming = {
  t: number;
  w: string;
};

export type VoRegion = {
  id: string;
  startMs: number;
  endMs: number;
  characterId: string;
  text: string;
  words?: WordTiming[];
};

export type PlayDefaults = {
  muteDialogue: boolean;
  bedGain: number;
  countdownMs: number;
};

export type ProceduralScene = {
  kind: "procedural";
  backdrop: [string, string];
  location: string;
  mood: string;
};

export type VideoScene = {
  kind: "video";
};

export type Pack = {
  id: string;
  title: string;
  tagline: string;
  durationMs: number;
  trimStartMs?: number;
  tags: string[];
  characters: Character[];
  voRegions: VoRegion[];
  playDefaults: PlayDefaults;
  scene: ProceduralScene | VideoScene;
  origin: "catalog" | "library";
};

export type StoredPack = {
  pack: Pack;
  video?: Blob;
  bed?: Blob;
  dialogue?: Blob;
  poster?: Blob;
};

export function validatePack(pack: Pack): string[] {
  const errors: string[] = [];
  if (!pack.id) errors.push("Pack needs an id.");
  if (!pack.title.trim()) errors.push("Pack needs a title.");
  if (pack.durationMs < 4000) errors.push("Scene should be at least 4 seconds.");
  if (!pack.voRegions.length) errors.push("Add at least one VO region.");
  if (!pack.characters.length) errors.push("Add at least one character.");
  for (const region of pack.voRegions) {
    if (region.endMs <= region.startMs) {
      errors.push(`Region "${region.text || region.id}" has invalid timestamps.`);
    }
    if (
      region.characterId !== "all" &&
      !pack.characters.some((c) => c.id === region.characterId)
    ) {
      errors.push(`Unknown character on region ${region.id}.`);
    }
  }
  return errors;
}

export function wordsFromText(text: string, startMs: number, endMs: number): WordTiming[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const span = Math.max(endMs - startMs, 1);
  return parts.map((w, i) => ({
    t: Math.round(startMs + (span * i) / parts.length),
    w,
  }));
}

export function activeRegion(pack: Pack, timeMs: number) {
  return pack.voRegions.find((r) => timeMs >= r.startMs && timeMs < r.endMs) ?? null;
}

export function characterMap(pack: Pack) {
  return Object.fromEntries(pack.characters.map((c) => [c.id, c]));
}

export function formatTime(ms: number) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(1).padStart(4, "0")}`;
}
