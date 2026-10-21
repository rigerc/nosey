export class AppError extends Error {
  readonly exitCode: number;
  readonly hint: string | undefined;

  constructor(message: string, options: {exitCode?: number; hint?: string; cause?: unknown} = {}) {
    super(message, {cause: options.cause});
    this.name = 'AppError';
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    const wrapped = new AppError(error.message, {cause: error});
    if (error.stack) wrapped.stack = error.stack;
    return wrapped;
  }
  return new AppError(String(error));
}
