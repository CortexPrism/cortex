import type { ICortexConfig } from '../../core/contracts/config.ts';
import type { ILogger } from '../../core/contracts/logging.ts';

export interface ICommandContext {
  args: string[];
  options: Record<string, unknown>;
  config: ICortexConfig;
  logger: ILogger;
}

export interface ICommand {
  name: string;
  description: string;
  action(ctx: ICommandContext): Promise<void>;
  subcommands?: ICommand[];
}

export interface ICommandEntry {
  path: string[];
  load(): Promise<ICommand>;
}
