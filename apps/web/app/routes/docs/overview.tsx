import { Link } from "react-router";

export default function DocsOverview() {
  return (
    <>
      <h1 className="text-3xl font-bold">Documentation</h1>
      <p className="mt-3 text-text-content">
        Preships is an agent-agnostic QA runner for web applications. It runs
        deterministic checks and produces reports for both humans and coding
        agents.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Core Workflow</h2>
      <ol className="mt-3 list-inside list-decimal space-y-2 text-text-content">
        <li>
          Initialize a repository with{" "}
          <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
            preships init
          </code>
        </li>
        <li>
          Run checks with{" "}
          <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
            preships run
          </code>{" "}
          or watch with{" "}
          <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
            preships watch
          </code>
        </li>
        <li>
          Review{" "}
          <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
            .preships/report.md
          </code>{" "}
          and fix failures before shipping
        </li>
      </ol>

      <h2 className="mt-10 text-xl font-semibold">Modes</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-text-primary">
                Mode
              </th>
              <th className="px-3 py-2 text-left font-medium text-text-primary">
                What It Does
              </th>
            </tr>
          </thead>
          <tbody className="text-text-content">
            <tr className="border-b border-border">
              <td className="px-3 py-2">Local</td>
              <td className="px-3 py-2">
                Deterministic checks + local model routing. No cloud dependency.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">Cloud</td>
              <td className="px-3 py-2">
                Managed model routing, billing history, and team analytics.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">Airgapped</td>
              <td className="px-3 py-2">
                Runs entirely inside private networks with custom endpoints.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-sm text-text-muted">
        Next:{" "}
        <Link to="/docs/getting-started" className="text-accent hover:underline">
          Getting Started
        </Link>
      </p>
    </>
  );
}
