/** Fouten met een contractcode en HTTP-status. */

export type PipelineErrorCode =
  | "too_short"
  | "not_english"
  | "too_long"
  | "invalid_response"
  | "upstream_error"
  | "bad_request"
  | "rate_limited";

const STATUS: Record<PipelineErrorCode, number> = {
  too_short: 422,
  not_english: 422,
  too_long: 413,
  invalid_response: 502,
  upstream_error: 502,
  bad_request: 400,
  rate_limited: 429,
};

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly status: number;

  constructor(code: PipelineErrorCode, message: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.status = STATUS[code];
  }
}
