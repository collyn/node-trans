export const ErrorCodes = {
  INVALID_INPUT: "INVALID_INPUT",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  FFMPEG_UNAVAILABLE: "FFMPEG_UNAVAILABLE",
};

export function apiError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}
