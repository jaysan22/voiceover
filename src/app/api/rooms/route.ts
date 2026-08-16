import { createRoom } from "@/lib/rooms";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name || "Host").slice(0, 24);
  const packId = String(body.packId || "elevator-pitch");
  const created = createRoom(name, packId);
  return NextResponse.json(created);
}
