"use client";

import { PackCard } from "@/components/PackCard";
import { deleteStoredPack, listStoredPacks } from "@/lib/storage";
import type { Pack } from "@/lib/pack";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Row = { pack: Pack; posterUrl: string | null; videoUrl: string | null };

export function LibraryGrid() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);

  async function refresh() {
    const stored = await listStoredPacks();
    setRows(
      stored.map((s) => ({
        pack: s.pack,
        posterUrl: s.poster ? URL.createObjectURL(s.poster) : null,
        videoUrl: s.video ? URL.createObjectURL(s.video) : null,
      })),
    );
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!rows.length) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 px-6 py-12 text-center">
        <p className="text-white/60">No packs in this browser yet.</p>
        <Link href="/studio" className="mt-4 inline-block rounded-full bg-[#d6ff3f] px-5 py-2.5 font-semibold text-black">
          Create your first pack
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <PackCard
          key={row.pack.id}
          pack={row.pack}
          posterUrl={row.posterUrl}
          videoUrl={row.videoUrl}
          href={`/dub/${row.pack.id}`}
          onEdit={() => router.push(`/studio?pack=${encodeURIComponent(row.pack.id)}`)}
          onDelete={() => {
            if (!confirm(`Delete “${row.pack.title}”?`)) return;
            void deleteStoredPack(row.pack.id).then(() => refresh());
          }}
        />
      ))}
    </div>
  );
}
