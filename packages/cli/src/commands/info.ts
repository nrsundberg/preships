import { execSync } from "node:child_process";
import { cpus, totalmem, platform, arch } from "node:os";

import chalk from "chalk";

interface SystemInfo {
  os: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalRamGb: number;
  gpu: string;
  ollamaInstalled: boolean;
  ollamaVersion: string | null;
  ollamaModels: string[];
  nodeVersion: string;
  playwrightInstalled: boolean;
}

function detectGpu(): string {
  const os = platform();
  try {
    if (os === "darwin") {
      const raw = execSync("system_profiler SPDisplaysDataType 2>/dev/null", {
        encoding: "utf8",
        timeout: 5000,
      });
      const chipMatch = raw.match(/Chipset Model:\s*(.+)/);
      const vramMatch = raw.match(/VRAM.*?:\s*(.+)/);
      if (chipMatch) {
        return vramMatch
          ? `${chipMatch[1].trim()} (${vramMatch[1].trim()})`
          : chipMatch[1].trim();
      }
    } else if (os === "linux") {
      return execSync("lspci 2>/dev/null | grep -i vga", {
        encoding: "utf8",
        timeout: 5000,
      }).trim() || "Unknown";
    }
  } catch {
    // detection failed
  }
  return "Unknown";
}

function detectOllama(): { installed: boolean; version: string | null; models: string[] } {
  try {
    const version = execSync("ollama --version 2>/dev/null", {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    let models: string[] = [];
    try {
      const raw = execSync("ollama list 2>/dev/null", {
        encoding: "utf8",
        timeout: 5000,
      });
      models = raw
        .split("\n")
        .slice(1)
        .map((line) => line.split(/\s+/)[0])
        .filter(Boolean);
    } catch {
      // ollama running but no models yet
    }
    return { installed: true, version, models };
  } catch {
    return { installed: false, version: null, models: [] };
  }
}

function detectPlaywright(): boolean {
  try {
    execSync("npx playwright --version 2>/dev/null", {
      encoding: "utf8",
      timeout: 10000,
    });
    return true;
  } catch {
    return false;
  }
}

function getSystemInfo(): SystemInfo {
  const cpu = cpus();
  const ollama = detectOllama();
  return {
    os: platform(),
    arch: arch(),
    cpuModel: cpu[0]?.model ?? "Unknown",
    cpuCores: cpu.length,
    totalRamGb: Math.round((totalmem() / (1024 ** 3)) * 10) / 10,
    gpu: detectGpu(),
    ollamaInstalled: ollama.installed,
    ollamaVersion: ollama.version,
    ollamaModels: ollama.models,
    nodeVersion: process.version,
    playwrightInstalled: detectPlaywright(),
  };
}

interface ModelRequirement {
  name: string;
  params: string;
  minRamGb: number;
  recommended: string;
  notes: string;
}

const MODEL_REQUIREMENTS: ModelRequirement[] = [
  {
    name: "qwen2.5-coder:3b",
    params: "3B",
    minRamGb: 4,
    recommended: "Light reasoning, fast checks",
    notes: "Good for basic plan interpretation and check orchestration.",
  },
  {
    name: "qwen2.5-coder:7b",
    params: "7B",
    minRamGb: 8,
    recommended: "Default for most tasks",
    notes: "Good balance of speed and quality for QA reasoning.",
  },
  {
    name: "llama3.2:11b-vision",
    params: "11B",
    minRamGb: 12,
    recommended: "Visual checks / screenshot analysis",
    notes: "Multimodal — can interpret screenshots for visual QA.",
  },
  {
    name: "qwen2.5-coder:14b",
    params: "14B",
    minRamGb: 16,
    recommended: "Complex reasoning",
    notes: "Stronger code understanding for tricky interaction flows.",
  },
  {
    name: "qwen2.5-coder:32b",
    params: "32B",
    minRamGb: 24,
    recommended: "Maximum local quality",
    notes: "Best local reasoning but needs significant RAM.",
  },
];

export function infoCommand(): void {
  const info = getSystemInfo();

  console.log(chalk.bold("\n  Preships System Info\n"));

  console.log(chalk.cyan("  System"));
  console.log(`    OS:         ${info.os} ${info.arch}`);
  console.log(`    CPU:        ${info.cpuModel} (${info.cpuCores} cores)`);
  console.log(`    RAM:        ${info.totalRamGb} GB`);
  console.log(`    GPU:        ${info.gpu}`);
  console.log(`    Node:       ${info.nodeVersion}`);

  console.log(chalk.cyan("\n  Dependencies"));
  console.log(
    `    Ollama:     ${info.ollamaInstalled ? chalk.green(`installed (${info.ollamaVersion})`) : chalk.red("not installed")}`,
  );
  if (info.ollamaModels.length > 0) {
    console.log(`    Models:     ${info.ollamaModels.join(", ")}`);
  }
  console.log(
    `    Playwright: ${info.playwrightInstalled ? chalk.green("available") : chalk.yellow("not installed")}`,
  );

  console.log(chalk.cyan("\n  Model Requirements (Ollama)\n"));
  console.log(
    chalk.dim(
      "    Model                     Params   Min RAM   Best For",
    ),
  );
  console.log(chalk.dim("    " + "─".repeat(72)));

  for (const m of MODEL_REQUIREMENTS) {
    const fits = info.totalRamGb >= m.minRamGb;
    const indicator = fits ? chalk.green("✓") : chalk.red("✗");
    const name = m.name.padEnd(28);
    const params = m.params.padEnd(9);
    const ram = `${m.minRamGb} GB`.padEnd(10);
    console.log(`  ${indicator} ${name}${params}${ram}${m.recommended}`);
  }

  const bestFit = [...MODEL_REQUIREMENTS]
    .reverse()
    .find((m) => info.totalRamGb >= m.minRamGb);

  if (bestFit) {
    console.log(
      chalk.green(`\n  Recommended default: ${chalk.bold(bestFit.name)}`),
    );
    console.log(chalk.dim(`  ${bestFit.notes}`));
  } else {
    console.log(
      chalk.yellow(
        "\n  Your system may not have enough RAM for local models.",
      ),
    );
    console.log(
      chalk.dim(
        "  Preships deterministic checks still work without a model.",
      ),
    );
  }

  console.log();
}
