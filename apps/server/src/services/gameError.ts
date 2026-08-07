export class GameError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new GameError(code, message, details);
}
