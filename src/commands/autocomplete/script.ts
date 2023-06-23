import {Args} from '@oclif/core'
import * as path from 'path'

import {AutocompleteBase} from '../../base'

export default class Script extends AutocompleteBase {
  static description = 'outputs autocomplete config script for shells';

  static hidden = true;

  static args = {
    shell: Args.string({
      description: 'Shell type',
      options: ['zsh', 'bash', 'powershell'],
      required: false,
    }),
  }

  async run() {
    const {args} = await this.parse(Script)
    const shell = args.shell || this.config.shell

    this.log(
      this.prefix +
        this.completionsFunctions[shell].launchSetupScript({
          envPrefix: this.cliBinEnvVar,
          setupPath: path.join(this.autocompleteCacheDir, `${shell}_setup`),
        }) +
        this.suffix,
    )
  }

  private get prefix(): string {
    return '\n'
  }

  private get suffix(): string {
    return ` # ${this.cliBin} autocomplete setup\n`
  }
}
