export interface Channel {
  readonly id: string;
  readonly name: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  send(userId: string, message: string): Promise<void>;

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
}

export interface IncomingMessage {
  channelId: string;
  userId: string;
  text: string;
  replyTo?: string;
}
