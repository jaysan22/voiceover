export type Player = {
  id: string;
  name: string;
  characterId: string | null;
};

export type RoomState = {
  code: string;
  hostId: string;
  packId: string;
  phase: "lobby" | "countdown" | "recording" | "review";
  countdownEndsAt: number | null;
  recordStartedAt: number | null;
  players: Player[];
  takes: Record<string, string>;
};

type Store = Map<string, RoomState>;

function getStore(): Store {
  const g = globalThis as typeof globalThis & { __rooms?: Store };
  if (!g.__rooms) g.__rooms = new Map();
  return g.__rooms;
}

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function createRoom(hostName: string, packId: string) {
  const roomCode = code();
  const hostId = crypto.randomUUID();
  const room: RoomState = {
    code: roomCode,
    hostId,
    packId,
    phase: "lobby",
    countdownEndsAt: null,
    recordStartedAt: null,
    players: [{ id: hostId, name: hostName, characterId: null }],
    takes: {},
  };
  getStore().set(roomCode, room);
  return { room, playerId: hostId };
}

export function getRoom(roomCode: string) {
  return getStore().get(roomCode.toUpperCase()) ?? null;
}

export function joinRoom(roomCode: string, name: string) {
  const room = getRoom(roomCode);
  if (!room) return null;
  if (room.players.length >= 4) throw new Error("Room is full (4 players).");
  const player: Player = { id: crypto.randomUUID(), name, characterId: null };
  room.players.push(player);
  return { room, playerId: player.id };
}

export function patchRoom(roomCode: string, mutate: (room: RoomState) => void) {
  const room = getRoom(roomCode);
  if (!room) return null;
  mutate(room);
  return room;
}
