import type { IAgentLoop, IAgentTurnOptions, IAgentTurnResult } from '../../ai/contracts/mod.ts';

export interface IRouteHandler {
  method: string;
  pattern: RegExp;
  handler: (req: Request, path: string) => Response | Promise<Response>;
}

export interface IRouteTable {
  routes: IRouteHandler[];
  handle(req: Request): Promise<Response>;
}
