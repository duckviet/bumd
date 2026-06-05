export function EmptyState({ title, detail }: { readonly title: string; readonly detail: string }): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffdf7] px-6 text-[#1f2523]">
      <section className="max-w-xl rounded border border-[#1f2523]/15 bg-white p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-[#65706b]">Empty</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-[#65706b]">{detail}</p>
      </section>
    </main>
  );
}
