export interface IMiddleware {
  process(req: Request): Promise<{ req: Request; response?: Response }>;
}

export interface IMiddlewareStack {
  use(middleware: IMiddleware): void;
  run(req: Request): Promise<Response>;
}
