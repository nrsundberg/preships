import process from "node:process";

function isInteractiveTerminal() {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

function isCiEnvironment() {
  const ciVars = [
    "CI",
    "CONTINUOUS_INTEGRATION",
    "BUILD_NUMBER",
    "RUN_ID",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "CIRCLECI",
  ];

  return ciVars.some((name) => Boolean(process.env[name]));
}

function isInstalledPackageContext() {
  return process.cwd().includes("node_modules");
}

function supportsColor() {
  return Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined);
}

function colorize(text, ansi) {
  if (!supportsColor()) return text;
  return `\u001B[${ansi}m${text}\u001B[0m`;
}

function printCreature() {
  const creature = [
    "                _..-^-.._",
    "             .-'  _   _  '-.",
    "            /    ( >_ )    \\",
    "           ;   .-`---'-.    ;",
    "           |  /  .---.  \\   |",
    "           ;  | (  o  ) |   ;",
    "            \\  \\ '---' /   /",
    "             '-._`---'_,-'",
    "                /|_|_|\\",
    "               /_/   \\_\\",
  ];

  const title = colorize("Thanks for installing Preships", "36;1");
  const subtitle = colorize("Run `preships` to start shipping safer.", "90");
  const coloredCreature = creature.map((line) => colorize(line, "35"));

  process.stdout.write(`\n${title}\n${subtitle}\n\n${coloredCreature.join("\n")}\n\n`);
}

function main() {
  if (!isInstalledPackageContext()) return;
  if (!isInteractiveTerminal()) return;
  if (isCiEnvironment()) return;

  printCreature();
}

try {
  main();
} catch {
  // Never fail dependency installation because of postinstall cosmetics.
}
