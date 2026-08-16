"use client";

import { ClipDubber } from "@/components/ClipDubber";
import { getCatalogPack } from "@/data/catalog";
import { getStoredPack } from "@/lib/storage";
import type { Pack } from "@/lib/pack";
import { useEffect, useState } from "react";

export function DubPage({ packId }: { packId: string }) {
  const [pack, setPack] = useState<Pack | null>(getCatalogPack(packId));
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [bedUrl, setBedUrl] = useState<string | null>(null);
  const [dialogueUrl, setDialogueUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const catalog = getCatalogPack(packId);
    if (catalog) {
      setPack(catalog);
      return;
    }
    void getStoredPack(packId).then((stored) => {
      if (!stored) {
        setMissing(true);
        return;
      }
      setPack(stored.pack);
      if (stored.video) setVideoUrl(URL.createObjectURL(stored.video));
      if (stored.bed) setBedUrl(URL.createObjectURL(stored.bed));
      if (stored.dialogue) setDialogueUrl(URL.createObjectURL(stored.dialogue));
    });
  }, [packId]);

  if (missing) {
    return <p className="px-5 py-20 text-center text-white/60">Pack not found in catalog or this browser&apos;s library.</p>;
  }
  if (!pack) return <p className="px-5 py-20 text-center">Loading pack…</p>;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <ClipDubber pack={pack} videoUrl={videoUrl} bedUrl={bedUrl} dialogueUrl={dialogueUrl} />
    </div>
  );
}
