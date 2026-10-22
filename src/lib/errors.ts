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

export function toAppError(cause: unknown): AppError {
  if (cause instanceof AppError) return cause;

  if (cause instanceof Error) {
    const wrapped = new AppError(cause.message, {cause: cause});

    if (cause.stack) wrapped.stack = cause.stack;

    return wrapped;
  }

  return new AppError(String(cause));
}
