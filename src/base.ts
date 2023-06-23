import { Command, Config } from "@oclif/core";
import * as fs from "fs-extra";
import * as path from "path";
import BashCompletionFunction from "./autocomplete/bash";
import ZshCompletionFunction from "./autocomplete/zsh";
import FishCompletionFunction from "./autocomplete/fish";
import CompletionFunction from "./autocomplete/completion-function";

interface CompletionFunctionConstructor {
  new (_: Config): CompletionFunction;
  launchSetupScript: (typeof CompletionFunction)["launchSetupScript"];
  shouldGenerateCompletion: (typeof CompletionFunction)["shouldGenerateCompletion"];
}

export abstract class AutocompleteBase extends Command {
  public get cliBin() {
    return this.config.bin;
  }

  public get cliBinEnvVar() {
    return this.config.bin.toUpperCase().replace(/-/g, "_");
  }

  protected completionsFunctions: Record<
    string,
    CompletionFunctionConstructor
  > = {
    bash: BashCompletionFunction,
    zsh: ZshCompletionFunction,
    fish: FishCompletionFunction,
  };

  public determineShell(shell: string) {
    if (!shell) {
      this.error("Missing required argument shell");
    } else if (this.isBashOnWindows(shell)) {
      return "bash";
    } else {
      return shell;
    }
  }

  public get autocompleteCacheDir(): string {
    return path.join(this.config.cacheDir, "autocomplete");
  }

  public get acLogfilePath(): string {
    return path.join(this.config.cacheDir, "autocomplete.log");
  }

  writeLogFile(msg: string) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    const fd = fs.openSync(this.acLogfilePath, "a");
    fs.write(fd, entry);
  }

  private isBashOnWindows(shell: string) {
    return shell.endsWith("\\bash.exe");
  }
}
