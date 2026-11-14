// Landing page: built in O6 (Octa). Temporary stub so the foundation PR builds.
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="display text-6xl">FieldShift</h1>
      <p className="max-w-md text-fg-muted">How much hotter and drier can your farm get before it fails?</p>
      <Link href="/app" className="rounded-full bg-gold px-5 py-2 text-sm font-medium text-[#0b0c09]">Open the app</Link>
    </main>
  );
}
