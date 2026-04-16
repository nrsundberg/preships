import assert from "node:assert/strict";
import test from "node:test";

import { completionCommand, getCompletionScript } from "./completion.js";

test("getCompletionScript returns bash completion with expected commands", () => {
  const script = getCompletionScript("bash");

  assert.match(script, /_preships_completion\(\)/);
  assert.match(script, /complete -F _preships_completion preships/);
  assert.match(script, /init run watch report status info chat config login completion/);
});

test("getCompletionScript returns zsh completion with compdef", () => {
  const script = getCompletionScript("zsh");

  assert.match(script, /^#compdef preships/m);
  assert.match(script, /compdef _preships preships/);
  assert.match(script, /"login:Log in to Preships cloud"/);
});

test("getCompletionScript returns fish completion entries", () => {
  const script = getCompletionScript("fish");

  assert.match(script, /complete -c preships -f/);
  assert.match(script, /-a completion -d "Generate shell completion script"/);
  assert.match(script, /-a login -d "Log in to Preships cloud"/);
  assert.match(script, /__fish_seen_subcommand_from report/);
});

test("completionCommand throws on unsupported shell", () => {
  assert.throws(
    () => completionCommand("powershell"),
    /Unsupported shell "powershell"\. Supported shells: bash, zsh, fish\./,
  );
});

