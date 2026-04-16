export default function SystemRequirements() {
  const models = [
    { name: "qwen2.5-coder:3b", params: "3B", ram: "4 GB", best: "Light reasoning, fast checks" },
    {
      name: "qwen2.5-coder:7b",
      params: "7B",
      ram: "8 GB",
      best: "Default — good balance of speed and quality",
    },
    {
      name: "llama3.2:11b-vision",
      params: "11B",
      ram: "12 GB",
      best: "Visual checks — screenshot analysis",
    },
    {
      name: "qwen2.5-coder:14b",
      params: "14B",
      ram: "16 GB",
      best: "Complex interaction flow reasoning",
    },
    { name: "qwen2.5-coder:32b", params: "32B", ram: "24 GB", best: "Maximum local quality" },
  ];

  return (
    <>
      <h1 className="text-3xl font-bold">System Requirements</h1>
      <p className="mt-3 text-text-content">
        Preships runs on macOS, Linux, and Windows. Deterministic checks work on any machine with
        Node 20+. No GPU or model runtime needed for those.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Minimum Requirements (Deterministic Only)</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Component</th>
              <th className="px-3 py-2 text-left font-medium">Requirement</th>
            </tr>
          </thead>
          <tbody className="text-text-content">
            <tr className="border-b border-border">
              <td className="px-3 py-2">Node.js</td>
              <td className="px-3 py-2">v20 or later</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">OS</td>
              <td className="px-3 py-2">macOS 13+, Ubuntu 20.04+, Windows 10+</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">RAM</td>
              <td className="px-3 py-2">4 GB minimum</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-3 py-2">Disk</td>
              <td className="px-3 py-2">~500 MB (Playwright browsers + CLI)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Local Model Requirements (Ollama)</h2>
      <p className="mt-3 text-text-content">
        For AI-powered checks, Preships uses{" "}
        <a href="https://ollama.com" className="text-accent hover:underline">
          Ollama
        </a>{" "}
        for local inference. Here's what each model tier needs:
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-left font-medium">Params</th>
              <th className="px-3 py-2 text-left font-medium">Min RAM</th>
              <th className="px-3 py-2 text-left font-medium">Best For</th>
            </tr>
          </thead>
          <tbody className="text-text-content">
            {models.map((m) => (
              <tr key={m.name} className="border-b border-border">
                <td className="px-3 py-2">
                  <code className="rounded bg-code-bg px-1 py-0.5 text-xs">{m.name}</code>
                </td>
                <td className="px-3 py-2">{m.params}</td>
                <td className="px-3 py-2">{m.ram}</td>
                <td className="px-3 py-2">{m.best}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-border border-l-accent border-l-[3px] bg-[#131a27] px-3 py-2.5 text-sm text-text-content">
        Apple Silicon Macs share system RAM with the GPU, so a 16 GB M-series MacBook can
        comfortably run 7B–14B models. On discrete GPU systems, VRAM is what matters — a 12 GB
        NVIDIA card handles up to 11B well.
      </div>

      <h2 className="mt-10 text-xl font-semibold">Check Your System</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>preships info</code>
      </pre>
      <p className="mt-3 text-text-content">
        Detects your hardware, checks for Ollama and Playwright, and recommends which model to use
        based on available RAM.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Cloud-Only Mode (No Local Model)</h2>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-code-bg p-3 text-sm">
        <code>{`preships login --api-key psk_your_key\npreships config set provider cloud`}</code>
      </pre>
      <p className="mt-3 text-sm text-text-muted">
        Deterministic checks still run locally. Only reasoning/visual checks route through the
        cloud.
      </p>
    </>
  );
}
