import { Link } from "react-router";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight">Preships</h1>
        <p className="mt-4 text-lg text-text-muted">
          Pre-ship QA agent for AI-assisted web development. Checks your UI before you ship.
        </p>
        <div className="mt-3">
          <code className="rounded-md border border-border bg-code-bg px-3 py-1.5 text-sm text-accent">
            npm install -g preships
          </code>
        </div>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            to="/docs/getting-started"
            className="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg no-underline transition-opacity hover:opacity-90"
          >
            Get Started
          </Link>
          <Link
            to="/docs"
            className="rounded-lg border border-border px-5 py-2.5 font-medium text-text-primary no-underline transition-colors hover:border-accent"
          >
            Docs
          </Link>
        </div>
      </div>
    </main>
  );
}
