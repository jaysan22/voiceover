import { getRoom, joinRoom, patchRoom } from "@/lib/rooms";
import { NextResponse } from "next/server";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = getRoom(code);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(room);
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = await req.json();
  const action = body.action as string;
  try {
    if (action === "join") {
      const joined = joinRoom(code, String(body.name || "Player").slice(0, 24));
      if (!joined) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(joined);
    }
    const room = patchRoom(code, (r) => {
      if (action === "claim") {
        const player = r.players.find((p) => p.id === body.playerId);
        if (player) player.characterId = body.characterId;
      }
      if (action === "start" && body.playerId === r.hostId) {
        r.phase = "countdown";
        r.countdownEndsAt = Date.now() + 3000;
        r.recordStartedAt = Date.now() + 3000;
        setTimeout(() => {
          patchRoom(code, (rr) => {
            rr.phase = "recording";
          });
        }, 3000);
        setTimeout(() => {
          patchRoom(code, (rr) => {
            rr.phase = "review";
          });
        }, 33000);
      }
    });
    if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ room });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
