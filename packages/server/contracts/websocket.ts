export interface IWSHandler {
  onMessage(socket: WebSocket, data: string): void;
  onClose(socket: WebSocket): void;
}

export interface IWSConnection {
  socket: WebSocket;
  sessionId: string;
  agentId?: string;
  connectedAt: number;
}

export interface IWSHub {
  broadcast(msg: string, filter?: (conn: IWSConnection) => boolean): void;
  sendToSession(sessionId: string, msg: string): void;
  getConnections(): IWSConnection[];
}
