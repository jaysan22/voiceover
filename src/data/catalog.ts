import { wordsFromText, type Pack } from "@/lib/pack";

function region(
  id: string,
  startMs: number,
  endMs: number,
  characterId: string,
  text: string,
) {
  return { id, startMs, endMs, characterId, text, words: wordsFromText(text, startMs, endMs) };
}

const defaults = {
  muteDialogue: true,
  bedGain: 0.62,
  countdownMs: 3000,
};

export const catalog: Pack[] = [
  {
    id: "elevator-pitch",
    title: "The Elevator Pitch",
    tagline: "Two coworkers. One trapped elevator. Zero chill.",
    durationMs: 24000,
    tags: ["office", "duo", "comedy"],
    origin: "catalog",
    playDefaults: defaults,
    scene: {
      kind: "procedural",
      backdrop: ["#1b1430", "#ff5c8a"],
      location: "Floor 14 — stuck",
      mood: "fluorescent panic",
    },
    characters: [
      { id: "kai", name: "Kai", color: "#d6ff3f" },
      { id: "remy", name: "Remy", color: "#3df0ff" },
    ],
    voRegions: [
      region("r1", 1800, 5200, "kai", "Okay nobody panic. This is fine. This is a networking opportunity."),
      region("r2", 5600, 9000, "remy", "Kai. The emergency phone is a banana sticker."),
      region("r3", 9800, 14000, "kai", "Then we pitch the banana. Vertical fruit. Disruptive potassium."),
      region("r4", 14800, 18800, "remy", "If we die in here I am haunting your LinkedIn."),
      region("r5", 19600, 23000, "kai", "Great. Engagement. That's a funnel."),
    ],
  },
  {
    id: "dragon-heist",
    title: "Dragon Heist",
    tagline: "Fantasy heist energy. Please do not pet the dragon.",
    durationMs: 26000,
    tags: ["fantasy", "duo", "chaos"],
    origin: "catalog",
    playDefaults: defaults,
    scene: {
      kind: "procedural",
      backdrop: ["#0f1c18", "#f4c430"],
      location: "Vault of Snorlaxion",
      mood: "epic whisper",
    },
    characters: [
      { id: "thief", name: "Nim", color: "#ffb703" },
      { id: "mage", name: "Vex", color: "#c77dff" },
    ],
    voRegions: [
      region("r1", 1600, 5000, "thief", "Step one: we don't look at the dragon."),
      region("r2", 5400, 9000, "mage", "I looked. It has eyeliner. We are so dead."),
      region("r3", 9800, 14200, "thief", "Grab the gem. Not the snack bowl. The gem."),
      region("r4", 15000, 19800, "mage", "This snack bowl is screaming in ancient jazz."),
      region("r5", 20600, 24800, "thief", "Run. Dramatic cape. Do not trip. Trip later."),
    ],
  },
  {
    id: "final-boss",
    title: "Final Boss Confession",
    tagline: "The villain has feelings. The hero has a catchphrase.",
    durationMs: 28000,
    tags: ["anime", "drama", "duo"],
    origin: "catalog",
    playDefaults: defaults,
    scene: {
      kind: "procedural",
      backdrop: ["#14081c", "#ff3d8a"],
      location: "Moonroof Citadel",
      mood: "sparkle doom",
    },
    characters: [
      { id: "hero", name: "Nova", color: "#3df0ff" },
      { id: "boss", name: "Umbra", color: "#ff3d8a" },
    ],
    voRegions: [
      region("r1", 1400, 5200, "hero", "It's over Umbra. I brought friendship. And also this glowing sword."),
      region("r2", 5800, 10800, "boss", "You think I wanted the moon? I wanted a group chat that doesn't leave me on read."),
      region("r3", 11600, 16000, "hero", "Then join the group chat. We have a pizza poll."),
      region("r4", 16800, 21400, "boss", "Fine. But I keep the cape. And the lightning. And the tragic backstory."),
      region("r5", 22200, 26800, "hero", "Deal. Now pose. The credits are coming."),
    ],
  },
  {
    id: "kitchen-meltdown",
    title: "Cooking Show Meltdown",
    tagline: "The souffle is sentient. The host is not okay.",
    durationMs: 22000,
    tags: ["food", "chaos", "solo-friendly"],
    origin: "catalog",
    playDefaults: defaults,
    scene: {
      kind: "procedural",
      backdrop: ["#2a1208", "#ff7a18"],
      location: "Live from Studio B",
      mood: "studio heat",
    },
    characters: [
      { id: "host", name: "Chef Lolo", color: "#ffd166" },
      { id: "souffle", name: "The Souffle", color: "#ef476f" },
    ],
    voRegions: [
      region("r1", 1200, 5000, "host", "Welcome back. Today we are folding dreams into egg whites."),
      region("r2", 5600, 9000, "souffle", "Fold this. I have unionized the ramekins."),
      region("r3", 9800, 14000, "host", "That's not in the recipe. Taste is about respect."),
      region("r4", 14800, 18600, "souffle", "Taste is about revenge. Preheat the audience."),
      region("r5", 19200, 21400, "host", "Anyway like and subscribe before it rises."),
    ],
  },
  {
    id: "spaceship-wifi",
    title: "Spaceship Wi-Fi",
    tagline: "The fate of the galaxy depends on the router.",
    durationMs: 25000,
    tags: ["sci-fi", "duo", "relatable"],
    origin: "catalog",
    playDefaults: defaults,
    scene: {
      kind: "procedural",
      backdrop: ["#071018", "#3df0ff"],
      location: "Bridge — 0 bars",
      mood: "low orbit rage",
    },
    characters: [
      { id: "cap", name: "Captain Zee", color: "#d6ff3f" },
      { id: "eng", name: "Pix", color: "#a0c4ff" },
    ],
    voRegions: [
      region("r1", 1500, 5400, "cap", "Pix. The hyperdrive is buffering. Buffering."),
      region("r2", 6000, 10200, "eng", "Have you tried turning the galaxy off and on again?"),
      region("r3", 11000, 15200, "cap", "I am not unplugging the sun. That's a whole ticket."),
      region("r4", 16000, 20200, "eng", "Password is still password. In space no one can hear you reset."),
      region("r5", 21000, 24200, "cap", "Connected. Never speak of this in the documentary."),
    ],
  },
  {
    id: "rose-ceremony",
    title: "Reality TV Rose",
    tagline: "Someone is getting a rose. Someone is getting roasted.",
    durationMs: 23000,
    tags: ["reality", "party", "shade"],
    origin: "catalog",
    playDefaults: defaults,
    scene: {
      kind: "procedural",
      backdrop: ["#1a0b16", "#ff4d6d"],
      location: "The Villa Balcony",
      mood: "soft lighting, hard feelings",
    },
    characters: [
      { id: "lead", name: "Marigold", color: "#ffb3c1" },
      { id: "contest", name: "Dash", color: "#d6ff3f" },
    ],
    voRegions: [
      region("r1", 1400, 5600, "lead", "Dash. I came here for love. And content. Mostly content."),
      region("r2", 6200, 10400, "contest", "I brought you a rose and a PowerPoint of my feelings."),
      region("r3", 11200, 15400, "lead", "That's the most romantic spreadsheet I have ever seen."),
      region("r4", 16200, 19800, "contest", "Slide four is just me whispering your name in a grocery store."),
      region("r5", 20400, 22400, "lead", "You're staying. The producers said clap now."),
    ],
  },
];

export function getCatalogPack(id: string) {
  return catalog.find((p) => p.id === id) ?? null;
}
