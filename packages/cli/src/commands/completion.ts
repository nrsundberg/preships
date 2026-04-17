const TOP_LEVEL_COMMANDS = [
  "init",
  "run",
  "watch",
  "report",
  "status",
  "info",
  "chat",
  "config",
  "login",
  "completion",
] as const;

export type SupportedShell = "bash" | "zsh" | "fish";

function isSupportedShell(shell: string): shell is SupportedShell {
  return shell === "bash" || shell === "zsh" || shell === "fish";
}

export function getCompletionScript(shell: SupportedShell): string {
  switch (shell) {
    case "bash":
      return buildBashCompletionScript();
    case "zsh":
      return buildZshCompletionScript();
    case "fish":
      return buildFishCompletionScript();
  }
}

export function completionCommand(shell: string): void {
  if (!isSupportedShell(shell)) {
    throw new Error(`Unsupported shell "${shell}". Supported shells: bash, zsh, fish.`);
  }

  process.stdout.write(getCompletionScript(shell));
}

function buildBashCompletionScript(): string {
  return `#!/usr/bin/env bash
# bash completion for preships

_preships_completion() {
  local cur prev cmd
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev=""
  if (( COMP_CWORD > 0 )); then
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
  fi
  cmd="\${COMP_WORDS[1]}"

  local commands="${TOP_LEVEL_COMMANDS.join(" ")}"
  if (( COMP_CWORD == 1 )); then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  case "\${cmd}" in
    report)
      if [[ "\${prev}" == "--format" ]]; then
        COMPREPLY=( $(compgen -W "markdown json" -- "\${cur}") )
      else
        COMPREPLY=( $(compgen -W "--format" -- "\${cur}") )
      fi
      ;;
    chat)
      COMPREPLY=( $(compgen -W "--model --endpoint" -- "\${cur}") )
      ;;
    login)
      COMPREPLY=( $(compgen -W "--api-key --api-url" -- "\${cur}") )
      ;;
    run)
      COMPREPLY=( $(compgen -W "--llm --no-llm" -- "\${cur}") )
      ;;
    init)
      COMPREPLY=( $(compgen -W "--url" -- "\${cur}") )
      ;;
    config)
      if (( COMP_CWORD == 2 )); then
        COMPREPLY=( $(compgen -W "get set" -- "\${cur}") )
      fi
      ;;
    completion)
      if (( COMP_CWORD == 2 )); then
        COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      fi
      ;;
  esac
}

complete -F _preships_completion preships
`;
}

function buildZshCompletionScript(): string {
  return `#compdef preships

_preships() {
  local -a commands
  commands=(
    "init:Initialize Preships in the current repository"
    "run:Run deterministic QA checks now"
    "watch:Watch repository changes and trigger runs automatically"
    "report:Print latest report from .preships/report.{md,json}"
    "status:Show repo and run status"
    "info:Show system specs, model requirements, and dependency status"
    "chat:Chat with your configured model to refine repo goals/settings"
    "config:Manage global config"
    "login:Log in to Preships cloud"
    "completion:Generate shell completion script"
  )

  if (( CURRENT == 2 )); then
    _describe "command" commands
    return
  fi

  case "\${words[2]}" in
    init)
      _arguments "--url[Target dev server URL]:url:_files"
      ;;
    run)
      _arguments "--llm[Run LLM review after checks]" \\
                 "--no-llm[Skip LLM review]"
      ;;
    report)
      _arguments "--format[Report format]:format:(markdown json)"
      ;;
    chat)
      _arguments "--model[Override model name for this chat session]:model:" \\
                 "--endpoint[Override model endpoint for this chat session]:url:"
      ;;
    login)
      _arguments "--api-key[Preships API key]:key:" \\
                 "--api-url[Cloud API URL]:url:"
      ;;
    config)
      if (( CURRENT == 3 )); then
        _values "config command" "get" "set"
      elif [[ "\${words[3]}" == "set" && CURRENT == 4 ]]; then
        _message "config key"
      fi
      ;;
    completion)
      if (( CURRENT == 3 )); then
        _values "shell" "bash" "zsh" "fish"
      fi
      ;;
  esac
}

compdef _preships preships
`;
}

function buildFishCompletionScript(): string {
  return `# fish completion for preships

complete -c preships -f

complete -c preships -n "__fish_use_subcommand" -a init -d "Initialize Preships in the current repository"
complete -c preships -n "__fish_use_subcommand" -a run -d "Run deterministic QA checks now"
complete -c preships -n "__fish_use_subcommand" -a watch -d "Watch repository changes and trigger runs automatically"
complete -c preships -n "__fish_use_subcommand" -a report -d "Print latest report from .preships/report.{md,json}"
complete -c preships -n "__fish_use_subcommand" -a status -d "Show repo and run status"
complete -c preships -n "__fish_use_subcommand" -a info -d "Show system specs, model requirements, and dependency status"
complete -c preships -n "__fish_use_subcommand" -a chat -d "Chat with your configured model to refine repo goals/settings"
complete -c preships -n "__fish_use_subcommand" -a config -d "Manage global config"
complete -c preships -n "__fish_use_subcommand" -a login -d "Log in to Preships cloud"
complete -c preships -n "__fish_use_subcommand" -a completion -d "Generate shell completion script"

complete -c preships -n "__fish_seen_subcommand_from init" -l url -d "Target dev server URL"
complete -c preships -n "__fish_seen_subcommand_from run" -l llm -d "Run LLM review after checks"
complete -c preships -n "__fish_seen_subcommand_from run" -l no-llm -d "Skip LLM review"
complete -c preships -n "__fish_seen_subcommand_from report" -l format -d "Report format" -a "markdown json"
complete -c preships -n "__fish_seen_subcommand_from chat" -l model -d "Override model name for this chat session"
complete -c preships -n "__fish_seen_subcommand_from chat" -l endpoint -d "Override model endpoint for this chat session"
complete -c preships -n "__fish_seen_subcommand_from login" -l api-key -d "Preships API key"
complete -c preships -n "__fish_seen_subcommand_from login" -l api-url -d "Cloud API URL"
complete -c preships -n "__fish_seen_subcommand_from config" -a "get set"
complete -c preships -n "__fish_seen_subcommand_from completion" -a "bash zsh fish"
`;
}
