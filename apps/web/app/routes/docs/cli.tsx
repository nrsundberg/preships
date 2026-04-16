export default function CliUsage() {
  const commands = [
    { name: "init", desc: "Initialize Preships in the current repository." },
    { name: "run", desc: "Execute checks once and write a report." },
    { name: "watch", desc: "Watch files and trigger checks automatically." },
    { name: "report", desc: "Print the latest .preships/report.md." },
    { name: "status", desc: "Show recent run history and repo readiness." },
    { name: "info", desc: "Show system specs, model requirements, and dependency status." },
    { name: "chat", desc: "Interactive chat to refine repo goals and settings." },
    { name: "config", desc: "Read or set global Preships configuration." },
    { name: "login", desc: "Configure cloud API key." },
  ];

  return (
    <>
      <h1 className="text-3xl font-bold">CLI Usage</h1>

      <h2 className="mt-10 text-xl font-semibold">Basic Syntax</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>preships &lt;command&gt; [options]</code>
      </pre>

      <h2 className="mt-10 text-xl font-semibold">Commands</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Command</th>
              <th className="px-3 py-2 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody className="text-text-content">
            {commands.map((cmd) => (
              <tr key={cmd.name} className="border-b border-border">
                <td className="px-3 py-2">
                  <code className="rounded bg-code-bg px-1 py-0.5 text-xs">
                    {cmd.name}
                  </code>
                </td>
                <td className="px-3 py-2">{cmd.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Examples</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>{`preships init --url http://localhost:5173
preships run
preships info
preships config set provider local
preships config get`}</code>
      </pre>

      <h3 className="mt-8 text-lg font-medium">Cloud Login</h3>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>preships login --api-key psk_123 --api-url https://api.preships.io</code>
      </pre>
    </>
  );
}
