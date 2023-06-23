import {Config} from '@oclif/core'

import CompletionFunction, {
  CommandCompletion,
  TopicSeparator,
  sanitizeSummary,
} from './completion-function'

const fishNeedsCommand = `
function __fish_completion_needs_command --description 'Auto-complete function for <command>'
    set -l cmd (commandline -opc) | grep -v "^-"

    # remove the first element of the cmd array
    set -l cmd $cmd[2..-1]


    set -l cmd_len (count $cmd)
    set -l args_len (count $argv)

    if test $cmd_len -eq 0 -o $cmd_len -ne $args_len
        return 1
    end

    if test $cmd_len -eq $args_len
        for i in (seq 1 $cmd_len)
            if test $cmd[$i] != $argv[$i]
                return 1
            end
        end
    end

    echo "cmd_len: $cmd_len" >>tmp

    return 0
end
`

const fishUsingCommand = `
function __fish_completion_using_command
    # call __fish_completion_needs_command to check if the command is valid
    if not __fish_completion_needs_command $argv
        return 1
    end
    return 0
end

`

export default class FishCompletionFunction extends CompletionFunction {
  static shouldGenerateCompletion(config: Config): boolean {
    return config.shell === 'fish'
  }

  static launchSetupScript({
    envPrefix,
    setupPath,
  }: {
    envPrefix: string;
    setupPath: string;
  }): string {
    return `
      set ${envPrefix}_AC_FISH_SETUP_PATH ${setupPath} &&
      test -f $${envPrefix}_AC_FISH_SETUP_PATH &&
      source $${envPrefix}_AC_FISH_SETUP_PATH;
    `.replace(/^(\s|\t)+/g, '').trim()
  }

  protected name = 'fish';

  protected get filename(): string {
    return `${this.config.bin}.fish`
  }

  private renderCommand(command: CommandCompletion, prefix?: string) {
    let compFunc = ''
    const {id, summary, flags = {}} = command
    const functionName = prefix ?
      `__fish_completion_needs_command ${prefix}` :
      '__fish_completion_needs_command'
    compFunc += `complete -f -c ${this.config.bin} -n '${functionName}' -a ${id} -d "${summary}"\n`
    for (const flagName in flags) {
      if (!flagName) continue
      const f = flags[flagName]
      if (f.hidden) continue
      const completionFlags = []
      completionFlags.push(['-l', f.name])
      if (f.char) completionFlags.push(['-s', f.char])
      f.summary = sanitizeSummary(f.summary || f.description)
      const flagDescription = f.summary.replace(/"/g, '\\"')
      if (flagDescription) {
        completionFlags.push(['-d', `"${flagDescription}"`])
      }
      if (f.type === 'option') {
        completionFlags.push(['-r'])
        f.deprecated && completionFlags.push(['-w'])
      } else if (f.allowNo) {
        compFunc += `complete -f -c ${this.config.bin} -n '${functionName}' -l no-${f.name}\n`
      }
      const flgs = completionFlags.flat().join(' ')
      compFunc += `complete -f -c ${this.config.bin} -n '${functionName}' ${flgs}\n`
    }
    compFunc += '\n'
    return compFunc
  }

  private generateWithColon(): string {
    let compFunc = ''
    for (const command of this.commands) {
      compFunc += `# Create a completion for the command: ${command.id}\n`
      compFunc += this.renderCommand(command)
    }
    return compFunc
  }

  private generateWithSpace() {
    let compFunc = ''
    for (const command of this.commands) {
      compFunc += `# Create a completion for the command: ${command.id}\n`
      const {id} = command
      const elements = id.split(':')
      const last = elements.pop()!
      const prefix = elements.join(' ') // last element has been popped
      command.id = last
      compFunc += this.renderCommand(command, prefix)
    }
    for (const topic of this.topics) {
      if (this.commandTopics.includes(topic.name)) continue
      compFunc += `# Create a completion for the topic: ${topic.name}\n`
      compFunc += `complete -f -c ${this.config.bin} -n '__fish_completion_needs_command' -a ${topic.name} -d "${topic.description}"\n\n`
    }
    return compFunc
  }

  protected getSetupScript(): string {
    // fish doesn't need a setup script as it handles completions folders out of the box
    return `
    # fish shell completion setup script
    # if the path to the fish completion script is not already in the fish_complete_path variable, add it
    if not contains ${this.completionScriptDir} $fish_complete_path
      set -gxp fish_complete_path ${this.completionScriptDir}
    end
    `
  }

  protected getCompletionScript(): string {
    let compFunc = `# Fish completion for ${this.config.bin}\n`
    compFunc += fishNeedsCommand
    compFunc += fishUsingCommand

    switch (this.topicSeparator) {
    case TopicSeparator.Colon:
      return compFunc + this.generateWithColon()
    case TopicSeparator.Space:
      return compFunc + this.generateWithSpace()
    }
  }
}
