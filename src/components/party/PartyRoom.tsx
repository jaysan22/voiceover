"use client";

import { DubPlayer } from "@/components/DubPlayer";
import { getCatalogPack } from "@/data/catalog";
import { getStoredPack } from "@/lib/storage";
import type { Pack } from "@/lib/pack";
import type { RoomState } from "@/lib/rooms";
import { useEffect, useState } from "react";

export function PartyRoom({ code }: { code: string }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [bedUrl, setBedUrl] = useState<string | null>(null);
  const [emoji, setEmoji] = useState<string[]>([]);
  const playerId = typeof window !== "undefined" ? localStorage.getItem(`room-${code}`) : null;

  useEffect(() => {
    let live = true;
    async function poll() {
      const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as RoomState;
      if (live) setRoom(data);
    }
    void poll();
    const id = setInterval(() => void poll(), 800);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [code]);

  useEffect(() => {
    if (!room) return;
    const catalog = getCatalogPack(room.packId);
    if (catalog) {
      setPack(catalog);
      return;
    }
    void getStoredPack(room.packId).then((stored) => {
      if (!stored) return;
      setPack(stored.pack);
      if (stored.video) setVideoUrl(URL.createObjectURL(stored.video));
      if (stored.bed) setBedUrl(URL.createObjectURL(stored.bed));
    });
  }, [room]);

  const me = room?.players.find((p) => p.id === playerId);
  const isHost = room?.hostId === playerId;

  async function claim(characterId: string) {
    await fetch(`/api/rooms/${code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", playerId, characterId }),
    });
  }

  async function start() {
    await fetch(`/api/rooms/${code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", playerId }),
    });
  }

  async function react(face: string) {
    setEmoji((e) => [...e.slice(-8), face]);
  }

  if (!room || !pack) return <p className="px-5 py-16 text-center">Finding the room…</p>;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#d6ff3f]">Room {room.code}</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl">{pack.title}</h1>
        </div>
        <div className="flex gap-2">
          {["😂", "🔥", "💀", "👏"].map((f) => (
            <button key={f} className="rounded-full bg-white/10 px-3 py-2 text-lg" onClick={() => void react(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {room.players.map((p) => (
          <span key={p.id} className="rounded-full border border-white/15 px-3 py-1 text-sm">
            {p.name}
            {p.id === room.hostId ? " · host" : ""} · {p.characterId ?? "unclaimed"}
          </span>
        ))}
      </div>
      {room.phase === "lobby" && (
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/60">Claim a character. Host starts the countdown for everyone.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {pack.characters.map((c) => (
              <button
                key={c.id}
                onClick={() => void claim(c.id)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-black"
                style={{ background: c.color }}
              >
                I&apos;m {c.name}
              </button>
            ))}
            <button className="rounded-full bg-white/15 px-4 py-2 text-sm" onClick={() => void claim("all")}>
              Chorus
            </button>
          </div>
          {isHost && (
            <button className="mt-5 rounded-full bg-[#d6ff3f] px-6 py-3 font-semibold text-black" onClick={() => void start()}>
              Shared countdown
            </button>
          )}
        </div>
      )}
      {(room.phase === "countdown" || room.phase === "recording" || room.phase === "review") && (
        <DubPlayer
          pack={pack}
          videoUrl={videoUrl}
          bedUrl={bedUrl}
          claimedCharacterId={me?.characterId === "all" ? null : me?.characterId}
          autoStart
        />
      )}
      <div className="mt-4 text-2xl">{emoji.join(" ")}</div>
    </div>
  );
}
