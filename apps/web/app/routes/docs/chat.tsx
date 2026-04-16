export default function ChatDocs() {
  return (
    <>
      <h1 className="text-3xl font-bold">Chat Mode</h1>
      <p className="mt-3 text-text-content">
        Use{" "}
        <code className="rounded bg-code-bg px-1.5 py-0.5 text-sm">
          preships chat
        </code>{" "}
        to interactively refine your repo's QA goals, plan docs, and
        configuration via conversation with your configured model.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Start a Session</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>{`preships chat
preships chat --model qwen2.5-coder:14b
preships chat --endpoint http://other-host:11434`}</code>
      </pre>

      <h2 className="mt-10 text-xl font-semibold">Slash Commands</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Command</th>
              <th className="px-3 py-2 text-left font-medium">What It Does</th>
            </tr>
          </thead>
          <tbody className="text-text-content">
            <tr className="border-b border-border">
              <td className="px-3 py-2">
                <code className="text-xs">/help</code>
              </td>
              <td className="px-3 py-2">Show available slash commands.</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">
                <code className="text-xs">/set &lt;key&gt; &lt;value&gt;</code>
              </td>
              <td className="px-3 py-2">Update a global config key.</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">
                <code className="text-xs">/goal &lt;text&gt;</code>
              </td>
              <td className="px-3 py-2">
                Append a new goal to{" "}
                <code className="text-xs">.preships/plan.md</code>.
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">
                <code className="text-xs">/show-config</code>
              </td>
              <td className="px-3 py-2">Print merged global config.</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">
                <code className="text-xs">/exit</code>
              </td>
              <td className="px-3 py-2">Exit the chat session.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">How It Works</h2>
      <p className="mt-3 text-text-content">
        The chat session loads your repo's plan doc and config as system context,
        then sends your messages to the configured model (local Ollama by
        default). Conversations are logged to{" "}
        <code className="rounded bg-code-bg px-1 py-0.5 text-xs">
          .preships/chat-log.md
        </code>{" "}
        so coding agents can reference what was discussed.
      </p>
    </>
  );
}
