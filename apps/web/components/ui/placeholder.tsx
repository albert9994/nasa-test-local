// Temporary box shown where a component will go. Delete the import once your component is real.
export function Placeholder({ task, title, note }: { task: string; title: string; note?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-line p-5 text-sm text-fg-muted">
      <span className="num mr-2 rounded bg-bg-elev px-1.5 py-0.5 text-xs text-gold">{task}</span>
      <strong className="text-fg">{title}</strong>
      {note ? <p className="mt-1">{note}</p> : null}
    </div>
  );
}
