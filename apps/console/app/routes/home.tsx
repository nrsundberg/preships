export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header>
        <h1 className="text-3xl font-bold">Preships Console</h1>
        <p className="mt-2 text-text-muted">
          Billing, usage, and team settings for your Preships account.
        </p>
      </header>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-border bg-panel p-5">
          <h2 className="text-lg font-semibold">Billing</h2>
          <p className="mt-2 text-sm text-text-muted">
            Track model usage and costs by repository, model, and day.
          </p>
        </article>
        <article className="rounded-xl border border-border bg-panel p-5">
          <h2 className="text-lg font-semibold">Runs</h2>
          <p className="mt-2 text-sm text-text-muted">
            Inspect QA runs, failures, and trendlines across projects.
          </p>
        </article>
        <article className="rounded-xl border border-border bg-panel p-5">
          <h2 className="text-lg font-semibold">Feedback</h2>
          <p className="mt-2 text-sm text-text-muted">
            Review submitted errors and user ratings from CLI interactions.
          </p>
        </article>
      </section>
    </main>
  );
}
