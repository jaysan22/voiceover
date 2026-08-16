import { LibraryGrid } from "@/components/LibraryGrid";
import Link from "next/link";

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-5 pb-8 pt-14">
        <p className="inline-flex rounded-full border border-[#d6ff3f]/40 bg-[#d6ff3f]/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-[#d6ff3f]">
          Packs in. Voice on. Mix out.
        </p>
        <h1 className="mt-5 max-w-3xl font-[family-name:var(--font-display)] text-6xl leading-[0.95] md:text-8xl">
          Make a scene. Dub it.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/65">
          Pack Studio turns your clip into a playable scene: bed vs dialogue, timestamped lines, then a karaoke dub with your mic on top.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/studio" className="rounded-full bg-[#d6ff3f] px-6 py-3 font-semibold text-black">
            Open Pack Studio
          </Link>
          <Link href="/party" className="rounded-full bg-[#ff3d8a] px-6 py-3 font-semibold">
            Party mode
          </Link>
        </div>
      </section>
      <section id="scenes" className="mx-auto max-w-6xl px-5 pb-20">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-3xl">Your library</h2>
          <Link href="/studio" className="text-sm text-[#d6ff3f]">
            New pack
          </Link>
        </div>
        <LibraryGrid />
      </section>
    </div>
  );
}
