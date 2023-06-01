import {AutocompleteBase} from '../../base'

const debug = require('debug')('autocomplete:create')

export default class Create extends AutocompleteBase {
  static hidden = true;

  static description =
    'create autocomplete setup scripts and completion functions';

  async run() {
    for (const [shell, CompletionFunction] of Object.entries(
      this.completionsFunctions,
    )) {
      if (!CompletionFunction.shouldGenerateCompletion(this.config)) {
        debug(`skipping ${shell} completion`)
        continue
      }
      debug(`generating ${shell} completion`)
      const completionFunction = new CompletionFunction(this.config)
      completionFunction.write()
    }
  }
}
