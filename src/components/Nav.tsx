import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07070c]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#d6ff3f] text-xs font-black text-black">
            VC
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
            Voicer Choicer
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link className="rounded-full px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white" href="/#scenes">
            Scenes
          </Link>
          <Link className="rounded-full px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white" href="/studio">
            Pack Studio
          </Link>
          <Link
            className="rounded-full bg-[#ff3d8a] px-4 py-1.5 font-semibold text-white shadow-[0_0_24px_rgba(255,61,138,0.35)]"
            href="/party"
          >
            Party
          </Link>
        </nav>
      </div>
    </header>
  );
}
