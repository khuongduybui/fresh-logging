// routes/_middleware.ts
import { MiddlewareHandlerContext } from "$fresh/server.ts";

import { DateTime } from "https://esm.sh/luxon@3.0.4";

export enum LoggingFormat {
  COMMON,
}
export interface LoggingOpts {
  format?: LoggingFormat;
  utcTime?: boolean;
  includeDuration?: boolean;
}
export function getLogger(options?: LoggingOpts) {
  const format = options?.format ?? LoggingFormat.COMMON;
  const includeDuration = options?.includeDuration ?? true;

  if (format === LoggingFormat.COMMON) {
    return async (
      req: Request,
      ctx: MiddlewareHandlerContext,
    ): Promise<Response> => {
      const now = options?.utcTime ? DateTime.utc() : DateTime.now();

      const start = performance.now();
      const res = await ctx.next();
      const end = performance.now();
      const duration = (end - start).toFixed(1);
      let durationText = "";
      if (includeDuration) {
        res.headers.set("Server-Timing", `handler;dur=${duration}`);
        durationText = `${duration}ms`;
      }
      const byteLength = "-"; // @TODO: res.clone() is time-consuming, look for a better way?
      const logParts = [
        (ctx.remoteAddr as Deno.NetAddr).hostname,
        "-",
        "-",
        `[${now.toFormat("dd/MMM/yyyy:HH:mm:ss ZZZ")}]`,
        `"${req.method} ${req.url}"`,
        res.status,
        byteLength,
        durationText,
      ];
      console.log(logParts.join(" "));

      return res;
    };
  }
}
