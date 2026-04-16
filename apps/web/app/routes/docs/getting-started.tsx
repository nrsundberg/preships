export default function GettingStarted() {
  return (
    <>
      <h1 className="text-3xl font-bold">Getting Started</h1>
      <p className="mt-3 text-text-content">
        Install Preships globally and initialize any web repo in under a minute.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Install</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>npm install -g preships</code>
      </pre>

      <h2 className="mt-10 text-xl font-semibold">Initialize a Repo</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>{`cd your-project\npreships init --url http://localhost:3000`}</code>
      </pre>

      <p className="mt-4 text-text-content">This creates:</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-text-content">
        <li>
          <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
            .preships/config.toml
          </code>
        </li>
        <li>
          <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
            .preships/plan.md
          </code>
        </li>
        <li>
          <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
            AGENTS.md
          </code>{" "}
          and Cursor rule hints
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Run Checks</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>preships run</code>
      </pre>

      <h2 className="mt-10 text-xl font-semibold">Watch Mode</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>preships watch</code>
      </pre>

      <div className="mt-4 rounded-lg border border-border border-l-accent border-l-[3px] bg-[#131a27] px-3 py-2.5 text-sm text-text-content">
        Watch mode debounces changes and creates updated reports in{" "}
        <code className="rounded bg-code-bg px-1 py-0.5 text-xs">
          .preships/report.md
        </code>
        .
      </div>
    </>
  );
}
