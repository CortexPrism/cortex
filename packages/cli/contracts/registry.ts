import type { ICommand, ICommandEntry } from './commands.ts';

export interface ICommandRegistry {
  register(cmd: ICommandEntry): void;
  loadAll(): Promise<void>;
  get(path: string[]): ICommand | undefined;
  list(): ICommandEntry[];
}

export interface ICommandLoader {
  load(path: string[]): Promise<ICommand>;
}
