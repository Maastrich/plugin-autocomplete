import {Config, Interfaces, Command} from '@oclif/core'

import {ensureDir, writeFile} from 'fs-extra'
import {join} from 'path'

export function sanitizeSummary(description?: string): string {
  if (description === undefined) {
    return ''
  }
  return (
    description
    .replace(/([`"])/g, '\\\\\\$1')
    // eslint-disable-next-line no-useless-escape
    .replace(/([\[\]])/g, '\\\\$1')
    .split('\n')[0]
  )
}

export type CommandCompletion = {
  id: string;
  summary: string;
  flags: CommandFlags;
};

export type CommandFlags = {
  [name: string]: Command.Flag.Cached;
};

export type Topic = {
  name: string;
  description: string;
};

export enum TopicSeparator {
  Colon = ':',
  Space = ' ',
}
export default abstract class CompletionFunction {
  static shouldGenerateCompletion(_: Config): boolean {
    return true
  }

  static launchSetupScript(_: {
    envPrefix: string;
    setupPath: string;
  }): string {
    throw new Error('Not implemented in this abstract class')
  }

  protected topics: Topic[];

  protected commands: CommandCompletion[];

  protected topicSeparator: TopicSeparator;

  protected commandTopics: string[] = [];

  protected abstract name: string;

  protected abstract get filename(): string;

  protected envPrefix = this.config.bin.toUpperCase().replace(/-/g, '_');

  constructor(protected config: Config) {
    const supportSpaces = this.config.topicSeparator === TopicSeparator.Space

    if (
      process.env.OCLIF_AUTOCOMPLETE_TOPIC_SEPARATOR === TopicSeparator.Colon ||
      !supportSpaces
    ) {
      this.topicSeparator = TopicSeparator.Colon
    } else {
      this.topicSeparator = TopicSeparator.Space
    }
    this.topics = this.getTopics()
    this.commands = this.getCommands()
    this.commandTopics = this.getCommandTopics()
  }

  public get autocompleteCacheDir(): string {
    return join(this.config.cacheDir, 'autocomplete')
  }

  protected getCommandTopics(): string[] {
    const coTopics: string[] = []

    for (const topic of this.topics) {
      for (const cmd of this.commands) {
        if (topic.name === cmd.id) {
          coTopics.push(topic.name)
        }
      }
    }

    return coTopics
  }

  protected getTopics(): Topic[] {
    const topics = this.config.topics
    .filter((topic: Interfaces.Topic) => {
      const hasChild = this.config.topics.some(subTopic =>
        subTopic.name.includes(`${topic.name}:`),
      )
      return hasChild
    })
    .sort((a, b) => {
      if (a.name < b.name) {
        return -1
      }
      if (a.name > b.name) {
        return 1
      }
      return 0
    })
    .map(t => {
      const description = t.description ?
        sanitizeSummary(t.description) :
        `${t.name.replace(/:/g, ' ')} commands`

      return {
        name: t.name,
        description,
      }
    })

    return topics
  }

  protected getCommands(): CommandCompletion[] {
    const cmds: CommandCompletion[] = []

    this.config.plugins.forEach(p => {
      p.commands.forEach(c => {
        if (c.hidden) return
        const summary = sanitizeSummary(c.summary || c.description)
        const flags = c.flags ?? {}

        cmds.push({
          id: c.id,
          summary,
          flags,
        })

        c.aliases.forEach(a => {
          cmds.push({
            id: a,
            summary,
            flags,
          })

          const split = a.split(':')

          let topic = split[0]

          // Completion funcs are generated from topics:
          // `force` -> `force:org` -> `force:org:open|list`
          //
          // but aliases aren't guaranteed to follow the plugin command tree
          // so we need to add any missing topic between the starting point and the alias.
          for (let i = 0; i < split.length - 1; i++) {
            if (!this.topics.find(t => t.name === topic)) {
              this.topics.push({
                name: topic,
                description: `${topic.replace(/:/g, ' ')} commands`,
              })
            }
            topic += `:${split[i + 1]}`
          }
        })
      })
    })

    return cmds
  }

  protected get setupScriptPath(): string {
    return join(this.autocompleteCacheDir, `${this.name}_setup`)
  }

  protected get completionScriptDir(): string {
    return join(this.autocompleteCacheDir, 'functions', this.name)
  }

  protected abstract getSetupScript(): null | string;

  protected abstract getCompletionScript(): string;

  public async write(): Promise<void> {
    const setupScript = this.getSetupScript()
    if (setupScript) {
      await writeFile(this.setupScriptPath, setupScript)
    }
    await ensureDir(this.completionScriptDir)
    const completionScriptPath = join(this.completionScriptDir, this.filename)
    await writeFile(completionScriptPath, this.getCompletionScript())
  }
}
