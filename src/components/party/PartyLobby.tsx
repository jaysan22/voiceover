"use client";

import { catalog } from "@/data/catalog";
import { listStoredPacks } from "@/lib/storage";
import type { Pack } from "@/lib/pack";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function PartyLobby() {
  const router = useRouter();
  const [name, setName] = useState("Host");
  const [code, setCode] = useState("");
  const [packId, setPackId] = useState(catalog[0].id);
  const [library, setLibrary] = useState<Pack[]>([]);

  useEffect(() => {
    void listStoredPacks().then((rows) => setLibrary(rows.map((r) => r.pack)));
  }, []);

  async function create() {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, packId }),
    });
    const data = await res.json();
    localStorage.setItem(`room-${data.room.code}`, data.playerId);
    localStorage.setItem("player-name", name);
    router.push(`/party/${data.room.code}`);
  }

  async function join() {
    const res = await fetch(`/api/rooms/${code.toUpperCase()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, action: "join" }),
    });
    if (!res.ok) return;
    const data = await res.json();
    localStorage.setItem(`room-${data.room.code}`, data.playerId);
    router.push(`/party/${data.room.code}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-[11px] uppercase tracking-[0.25em] text-[#3df0ff]">Thin party</p>
      <h1 className="font-[family-name:var(--font-display)] text-5xl">2–4 friends. One scene.</h1>
      <p className="mt-3 text-white/60">Claim a character, hit the shared countdown, record on your device. Host hears the chaos.</p>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-semibold">Host a room</h2>
          <input className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2" value={packId} onChange={(e) => setPackId(e.target.value)}>
            {catalog.concat(library).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button className="mt-4 w-full rounded-full bg-[#ff3d8a] py-3 font-semibold" onClick={() => void create()}>
            Create room
          </button>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-semibold">Join with code</h2>
          <input className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 uppercase tracking-[0.4em]" placeholder="R7KQ" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="mt-4 w-full rounded-full bg-[#d6ff3f] py-3 font-semibold text-black" onClick={() => void join()}>
            Join
          </button>
          <Link href="/" className="mt-4 block text-center text-sm text-white/50">
            Or dub solo
          </Link>
        </div>
      </div>
    </div>
  );
}
