// routes/_middleware.ts
import { MiddlewareHandlerContext } from "$fresh/server.ts";

import { DateTime } from "https://esm.sh/luxon@3.0.4";

export enum LoggingFormat {
  COMMON,
}
export enum ResolutionField {
  rfc931,
  authuser,
  bytes,
}
export type resolver = (req: Request, ctx: MiddlewareHandlerContext, res: Response) => string | Promise<string>;
export interface LoggingOpts {
  format?: LoggingFormat;
  utcTime?: boolean;
  includeDuration?: boolean;
  resolvers?: {
    [ResolutionField.rfc931]?: resolver;
    [ResolutionField.authuser]?: resolver;
    [ResolutionField.bytes]?: resolver;
  };
}
export function getLogger(options?: LoggingOpts) {
  const format = options?.format ?? LoggingFormat.COMMON;
  const includeDuration = options?.includeDuration ?? true;
  const resolvers = options?.resolvers ?? {};
  resolvers[ResolutionField.rfc931] = resolvers[ResolutionField.rfc931] ?? (() => "-");
  resolvers[ResolutionField.authuser] = resolvers[ResolutionField.authuser] ?? (() => "-");
  resolvers[ResolutionField.bytes] = resolvers[ResolutionField.bytes] ?? (() => "-");

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
      const logParts = [
        (ctx.remoteAddr as Deno.NetAddr).hostname,
        await resolvers[ResolutionField.rfc931]?.(req, ctx, res),
        await resolvers[ResolutionField.authuser]?.(req, ctx, res),
        `[${now.toFormat("dd/MMM/yyyy:HH:mm:ss ZZZ")}]`,
        `"${req.method} ${req.url}"`,
        res.status,
        await resolvers[ResolutionField.bytes]?.(req, ctx, res),
        durationText,
      ];
      console.log(logParts.join(" "));

      return res;
    };
  }
}
