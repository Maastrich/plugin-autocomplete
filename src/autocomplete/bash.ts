import {join} from 'path'

import CompletionFunction, {
  CommandCompletion,
  TopicSeparator,
} from './completion-function'

export default class BashCompletionFunction extends CompletionFunction {
  static launchSetupScript({
    envPrefix,
    setupPath,
  }: {
    envPrefix: string;
    setupPath: string;
  }): string {
    return `
      export ${envPrefix}_AC_BASH_SETUP_PATH=${setupPath} && \\
      test -f $${envPrefix}_AC_BASH_SETUP_PATH && \\
      source $${envPrefix}_AC_BASH_SETUP_PATH;
    `
  }

  protected name = 'bash';

  protected get filename(): string {
    return `${this.config.bin}.bash`
  }

  protected getSetupScript(): string {
    const setup = join(this.completionScriptDir, this.filename)
    const envPrefix = this.envPrefix
    return `
      export ${envPrefix}_AC_BASH_COMPFUNC_PATH=${setup} && \\
      test -f $${envPrefix}_AC_BASH_COMPFUNC_PATH && \\
      source $${envPrefix}_AC_BASH_COMPFUNC_PATH;
     `.replace(/^\s+/g, '')
  }

  private genCmdPublicFlags(Command: CommandCompletion): string {
    const Flags = Command.flags || {}
    return Object.keys(Flags)
    .filter(flag => !Flags[flag].hidden)
    .map(flag => `--${flag}`)
    .join(' ')
  }

  private getBashCommandsWithFlagsList(): string {
    return this.commands
    .map(c => {
      const publicFlags = this.genCmdPublicFlags(c).trim()
      return `${c.id} ${publicFlags}`
    })
    .join('\n')
  }

  private generateWithSpaces(): string {
    return `#!/usr/bin/env bash
# This function joins an array using a character passed in
# e.g. ARRAY=(one two three) -> join_by ":" \${ARRAY[@]} -> "one:two:three"
function join_by { local IFS="$1"; shift; echo "$*"; }

_${this.config.bin}_autocomplete()
{

  local cur="\${COMP_WORDS[COMP_CWORD]}" opts normalizedCommand colonPrefix IFS=$' \\t\\n'
  COMPREPLY=()

  local commands="
${this.getBashCommandsWithFlagsList}
"

  function __trim_colon_commands()
  {
    # Turn $commands into an array
    commands=("\${commands[@]}")

    if [[ -z "$colonPrefix" ]]; then
      colonPrefix="$normalizedCommand:"
    fi

    # Remove colon-word prefix from $commands
    commands=( "\${commands[@]/$colonPrefix}" )

    for i in "\${!commands[@]}"; do
      if [[ "\${commands[$i]}" == "$normalizedCommand" ]]; then
        # If the currently typed in command is a topic command we need to remove it to avoid suggesting it again
        unset "\${commands[$i]}"
      else
        # Trim subcommands from each command
        commands[$i]="\${commands[$i]%%:*}"
      fi
    done
  }

  if [[ "$cur" != "-"* ]]; then
    # Command
    __COMP_WORDS=( "\${COMP_WORDS[@]:1}" )

    # The command typed by the user but separated by colons (e.g. "mycli command subcom" -> "command:subcom")
    normalizedCommand="$( printf "%s" "$(join_by ":" "\${__COMP_WORDS[@]}")" )"

    # The command hirarchy, with colons, leading up to the last subcommand entered (e.g. "mycli com subcommand subsubcom" -> "com:subcommand:")
    colonPrefix="\${normalizedCommand%"\${normalizedCommand##*:}"}"

    if [[ -z "$normalizedCommand" ]]; then
      # If there is no normalizedCommand yet the user hasn't typed in a full command
      # So we should trim all subcommands & flags from $commands so we can suggest all top level commands
      opts=$(printf "%s " "\${commands[@]}" | grep -Eo '^[a-zA-Z0-9_-]+')
    else
      # Filter $commands to just the ones that match the $normalizedCommand and turn into an array
      commands=( $(compgen -W "$commands" -- "\${normalizedCommand}") )
      # Trim higher level and subcommands from the subcommands to suggest
      __trim_colon_commands "$colonPrefix"

      opts=$(printf "%s " "\${commands[@]}") # | grep -Eo '^[a-zA-Z0-9_-]+'
    fi
  else 
    # Flag

    # The full CLI command separated by colons (e.g. "mycli command subcommand --fl" -> "command:subcommand")
    # This needs to be defined with $COMP_CWORD-1 as opposed to above because the current "word" on the command line is a flag and the command is everything before the flag
    normalizedCommand="$( printf "%s" "$(join_by ":" "\${COMP_WORDS[@]:1:($COMP_CWORD - 1)}")" )"

    # The line below finds the command in $commands using grep
    # Then, using sed, it removes everything from the found command before the --flags (e.g. "command:subcommand:subsubcom --flag1 --flag2" -> "--flag1 --flag2")
    opts=$(printf "%s " "\${commands[@]}" | grep "\${normalizedCommand}" | sed -n "s/^\${normalizedCommand} //p")
  fi

  COMPREPLY=($(compgen -W "$opts" -- "\${cur}"))
}

complete -F _${this.config.bin}_autocomplete ${this.config.bin}
`
  }

  private generateWithColons(): string {
    return `#!/usr/bin/env bash

_${this.config.bin}_autocomplete()
{

  local cur="\${COMP_WORDS[COMP_CWORD]}" opts IFS=$' \\t\\n'
  COMPREPLY=()

  local commands="
${this.getBashCommandsWithFlagsList}
"

  if [[ "$cur" != "-"* ]]; then
    opts=$(printf "$commands" | grep -Eo '^[a-zA-Z0-9:_-]+')
  else
    local __COMP_WORDS
    if [[ \${COMP_WORDS[2]} == ":" ]]; then
      #subcommand
      __COMP_WORDS=$(printf "%s" "\${COMP_WORDS[@]:1:3}")
    else
      #simple command
      __COMP_WORDS="\${COMP_WORDS[@]:1:1}"
    fi
    opts=$(printf "$commands" | grep "\${__COMP_WORDS}" | sed -n "s/^\${__COMP_WORDS} //p")
  fi
  _get_comp_words_by_ref -n : cur
  COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
  __ltrim_colon_completions "$cur"
  return 0

}

complete -o default -F _${this.config.bin}_autocomplete ${this.config.bin}
`
  }

  protected get completionScript(): string {
    switch (this.topicSeparator) {
    case TopicSeparator.Colon:
      return this.generateWithColons()
    case TopicSeparator.Space:
      return this.generateWithSpaces()
    }
  }
}
