/**
 * An API call that came back with a non-2xx status.
 *
 * Carries the status because the UI reacts differently to each: 401 means "sign
 * in", 403 means "signed in, but this page is not yours", and everything else is
 * a generic failure. A bare `Error` would collapse those into one message.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Whether a thrown value is an `ApiError` with the given status. */
export function isApiError(error: unknown, status?: number): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  return status === undefined || error.status === status;
}
