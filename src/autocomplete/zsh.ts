import * as util from 'util'

import CompletionFunction, {
  CommandFlags,
  TopicSeparator,
  sanitizeSummary,
} from './completion-function'

const argTemplate = '        "%s")\n          %s\n        ;;\n'

export default class ZshCompletionFunction extends CompletionFunction {
  static launchSetupScript({
    envPrefix,
    setupPath,
  }: {
    envPrefix: string;
    setupPath: string;
  }): string {
    return `
      export ${envPrefix}_AC_ZSH_SETUP_PATH=${setupPath} && \\
      test -f $${envPrefix}_AC_ZSH_SETUP_PATH && \\
      source $${envPrefix}_AC_ZSH_SETUP_PATH;
    `
  }

  protected name = 'zsh';

  protected get filename(): string {
    return `_${this.config.bin}`
  }

  private generateWithSpaces(): string {
    const firstArgs: { id: string; summary?: string }[] = []

    this.topics.forEach(t => {
      if (!t.name.includes(':'))
        firstArgs.push({
          id: t.name,
          summary: t.description,
        })
    })
    this.commands.forEach(c => {
      if (!firstArgs.find(a => a.id === c.id) && !c.id.includes(':'))
        firstArgs.push({
          id: c.id,
          summary: c.summary,
        })
    })

    const mainArgsCaseBlock = () => {
      let caseBlock = 'case $line[1] in\n'

      for (const arg of firstArgs) {
        if (this.commandTopics.includes(arg.id)) {
          // coTopics already have a completion function.
          caseBlock += `${arg.id})\n  _${this.config.bin}_${arg.id}\n  ;;\n`
        } else {
          const cmd = this.commands.find(c => c.id === arg.id)

          if (cmd) {
            // if it's a command and has flags, inline flag completion statement.
            // skip it from the args statement if it doesn't accept any flag.
            if (Object.keys(cmd.flags).length > 0) {
              caseBlock += `${arg.id})\n${this.genZshFlagArgumentsBlock(
                cmd.flags,
              )} ;; \n`
            }
          } else {
            // it's a topic, redirect to its completion function.
            caseBlock += `${arg.id})\n  _${this.config.bin}_${arg.id}\n  ;;\n`
          }
        }
      }

      caseBlock += 'esac\n'

      return caseBlock
    }

    const compFunc = `#compdef ${this.config.bin}
${this.config.binAliases?.map(a => `compdef ${a}=${this.config.bin}`).join('\n') ?? ''}
${this.topics.map(t => this.genZshTopicCompFun(t.name)).join('\n')}

_${this.config.bin}() {
  local context state state_descr line
  typeset -A opt_args

  _arguments -C "1: :->cmds" "*::arg:->args"

  case "$state" in
    cmds)
      ${this.genZshValuesBlock(firstArgs)}
    ;;
    args)
      ${mainArgsCaseBlock()}
    ;;
  esac
}

_${this.config.bin}
`
  }

  private genZshFlagSpecs(Klass: any): string {
    return Object.keys(Klass.flags || {})
    .filter(flag => Klass.flags && !Klass.flags[flag].hidden)
    .map(flag => {
      const f = (Klass.flags && Klass.flags[flag]) || {description: ''}
      const isBoolean = f.type === 'boolean'
      const isOption = f.type === 'option'
      const name = isBoolean ? flag : `${flag}=-`
      const multiple = isOption && f.multiple ? '*' : ''
      const valueCmpl = isBoolean ? '' : ':'
      const completion = `${multiple}--${name}[${sanitizeSummary(
        f.summary || f.description,
      )}]${valueCmpl}`
      return `"${completion}"`
    })
    .join('\n')
  }

  /* eslint-disable no-useless-escape */
  private get genAllCommandsMetaString(): string {
    return this.commands
    .map(c => {
      return `\"${c.id.replace(/:/g, '\\:')}:${c.summary}\"`
    })
    .join('\n')
  }
  /* eslint-enable no-useless-escape */

  private get genCaseStatementForFlagsMetaString(): string {
    // command)
    //   _command_flags=(
    //   "--boolean[bool descr]"
    //   "--value=-[value descr]:"
    //   )
    // ;;
    return this.commands
    .map(c => {
      return `${c.id})
    _command_flags=(
      ${this.genZshFlagSpecs(c)}
    )
  ;;\n`
    })
    .join('\n')
  }

  private generateWithColons(): string {
    const cliBin = this.config.bin
    const allCommandsMeta = this.genAllCommandsMetaString
    const caseStatementForFlagsMeta = this.genCaseStatementForFlagsMetaString

    return `#compdef ${cliBin}

_${cliBin} () {
  local _command_id=\${words[2]}
  local _cur=\${words[CURRENT]}
  local -a _command_flags=()

  ## public cli commands & flags
  local -a _all_commands=(
${allCommandsMeta}
  )

  _set_flags () {
    case $_command_id in
${caseStatementForFlagsMeta}
    esac
  }
  ## end public cli commands & flags

  _complete_commands () {
    _describe -t all-commands "all commands" _all_commands
  }

  if [ $CURRENT -gt 2 ]; then
    if [[ "$_cur" == -* ]]; then
      _set_flags
    else
      _path_files
    fi
  fi


  _arguments -S '1: :_complete_commands' \\
                $_command_flags
}

_${cliBin}
`
  }

  private genZshFlagArgumentsBlock(flags?: CommandFlags): string {
    // if a command doesn't have flags make it only complete files
    // also add comp for the global `--help` flag.
    if (!flags)
      return '_arguments -S \\\n --help"[Show help for command]" "*: :_files'

    const flagNames = Object.keys(flags)

    // `-S`:
    // Do not complete flags after a ‘--’ appearing on the line, and ignore the ‘--’. For example, with -S, in the line:
    // foobar -x -- -y
    // the ‘-x’ is considered a flag, the ‘-y’ is considered an argument, and the ‘--’ is considered to be neither.
    let argumentsBlock = '_arguments -S \\\n'

    for (const flagName of flagNames) {
      const f = flags[flagName]

      // skip hidden flags
      if (f.hidden) continue

      const flagSummary = sanitizeSummary(f.summary || f.description)

      let flagSpec = ''

      if (f.type === 'option') {
        if (f.char) {
          if (f.multiple) {
            // this flag can be present multiple times on the line
            flagSpec += `"*"{-${f.char},--${f.name}}`
          } else {
            flagSpec += `"(-${f.char} --${f.name})"{-${f.char},--${f.name}}`
          }

          flagSpec += `"[${flagSummary}]`

          if (f.options) {
            flagSpec += `:${f.name} options:(${f.options?.join(' ')})"`
          } else {
            flagSpec += ':file:_files"'
          }
        } else {
          if (f.multiple) {
            // this flag can be present multiple times on the line
            flagSpec += '"*"'
          }

          flagSpec += `--${f.name}"[${flagSummary}]:`

          if (f.options) {
            flagSpec += `${f.name} options:(${f.options.join(' ')})"`
          } else {
            flagSpec += 'file:_files"'
          }
        }
      } else if (f.char) {
        // Flag.Boolean
        flagSpec += `"(-${f.char} --${f.name})"{-${f.char},--${f.name}}"[${flagSummary}]"`
      } else {
        // Flag.Boolean
        flagSpec += `--${f.name}"[${flagSummary}]"`
      }

      flagSpec += ' \\\n'
      argumentsBlock += flagSpec
    }
    // add global `--help` flag
    argumentsBlock += '--help"[Show help for command]" \\\n'
    // complete files if `-` is not present on the current line
    argumentsBlock += '"*: :_files"'

    return argumentsBlock
  }

  private genZshValuesBlock(
    subArgs: { id: string; summary?: string }[],
  ): string {
    let valuesBlock = '_values "completions" \\\n'

    subArgs.forEach(subArg => {
      valuesBlock += `"${subArg.id}[${subArg.summary}]" \\\n`
    })

    return valuesBlock
  }

  private genZshTopicCompFun(id: string): string {
    const coTopics: string[] = []

    for (const topic of this.topics) {
      for (const cmd of this.commands) {
        if (topic.name === cmd.id) {
          coTopics.push(topic.name)
        }
      }
    }

    const flagArgsTemplate = '        "%s")\n          %s\n        ;;\n'

    const underscoreSepId = id.replace(/:/g, '_')
    const depth = id.split(':').length

    const isCotopic = coTopics.includes(id)

    if (isCotopic) {
      const compFuncName = `${this.config.bin}_${underscoreSepId}`

      const coTopicCompFunc = `_${compFuncName}() {
  _${compFuncName}_flags() {
    local context state state_descr line
    typeset -A opt_args

    ${this.genZshFlagArgumentsBlock(
      this.commands.find(c => c.id === id)?.flags,
  )}
  }

  local context state state_descr line
  typeset -A opt_args

  _arguments -C "1: :->cmds" "*: :->args"

  case "$state" in
    cmds)
      if [[ "\${words[CURRENT]}" == -* ]]; then
        _${compFuncName}_flags
      else
%s
      fi
      ;;
    args)
      case $line[1] in
%s
      *)
        _${compFuncName}_flags
      ;;
      esac
      ;;
  esac
}
`
      const subArgs: { id: string; summary?: string }[] = []

      let argsBlock = ''

      this.topics
      .filter(
        t =>
          t.name.startsWith(id + ':') &&
            t.name.split(':').length === depth + 1,
      )
      .forEach(t => {
        const subArg = t.name.split(':')[depth]

        subArgs.push({
          id: subArg,
          summary: t.description,
        })

        argsBlock += util.format(
          argTemplate,
          subArg,
          `_${this.config.bin}_${underscoreSepId}_${subArg}`,
        )
      })

      this.commands
      .filter(
        c =>
          c.id.startsWith(id + ':') && c.id.split(':').length === depth + 1,
      )
      .forEach(c => {
        if (coTopics.includes(c.id)) return
        const subArg = c.id.split(':')[depth]

        subArgs.push({
          id: subArg,
          summary: c.summary,
        })

        argsBlock += util.format(
          flagArgsTemplate,
          subArg,
          this.genZshFlagArgumentsBlock(c.flags),
        )
      })

      return util.format(
        coTopicCompFunc,
        this.genZshValuesBlock(subArgs),
        argsBlock,
      )
    }
    let argsBlock = ''

    const subArgs: { id: string; summary?: string }[] = []
    this.topics
    .filter(
      t =>
        t.name.startsWith(id + ':') && t.name.split(':').length === depth + 1,
    )
    .forEach(t => {
      const subArg = t.name.split(':')[depth]

      subArgs.push({
        id: subArg,
        summary: t.description,
      })

      argsBlock += util.format(
        argTemplate,
        subArg,
        `_${this.config.bin}_${underscoreSepId}_${subArg}`,
      )
    })

    this.commands
    .filter(
      c => c.id.startsWith(id + ':') && c.id.split(':').length === depth + 1,
    )
    .forEach(c => {
      if (coTopics.includes(c.id)) return
      const subArg = c.id.split(':')[depth]

      subArgs.push({
        id: subArg,
        summary: c.summary,
      })

      argsBlock += util.format(
        flagArgsTemplate,
        subArg,
        this.genZshFlagArgumentsBlock(c.flags),
      )
    })

    const topicCompFunc = `_${this.config.bin}_${underscoreSepId}() {
  local context state state_descr line
  typeset -A opt_args

  _arguments -C "1: :->cmds" "*::arg:->args"

  case "$state" in
    cmds)
%s
      ;;
    args)
      case $line[1] in
%s
      esac
      ;;
  esac
}
`
    return util.format(
      topicCompFunc,
      this.genZshValuesBlock(subArgs),
      argsBlock,
    )
  }

  protected getSetupScript(): string {
    return `
    set -gxa fpath ${this.autocompleteCacheDir};
    autoload -Uz compinit;
    compinit -i;
    `.replace(/^\s+/gm, '')
  }

  protected get completionScript(): string {
    const compFunc = `# Zsh completion for ${this.config.bin}\n`

    switch (this.topicSeparator) {
    case TopicSeparator.Colon:
      return compFunc + this.generateWithColons()
    case TopicSeparator.Space:
      return compFunc + this.generateWithSpaces()
    }
  }
}
