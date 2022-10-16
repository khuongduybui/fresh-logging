import { MiddlewareHandler, MiddlewareHandlerContext } from "$fresh/server.ts";

import { DateTime } from "https://esm.sh/luxon@3.0.4";
import { ConsoleStream, Logger } from "https://deno.land/x/optic@1.3.5/mod.ts";
import { TokenReplacer } from "https://deno.land/x/optic@1.3.5/formatters/mod.ts";

export enum LoggingFormat {
  COMMON,
  APACHE_COMBINED,
}
export enum ResolutionField {
  rfc931,
  authuser,
  bytes,
}
export type resolver = (req: Request, ctx: MiddlewareHandlerContext, res: Response) => string | Promise<string>;
export type logger = (message: string) => string;
export interface LoggingOpts {
  format?: LoggingFormat;
  utcTime?: boolean;
  includeDuration?: boolean;
  resolvers?: {
    [ResolutionField.rfc931]?: resolver;
    [ResolutionField.authuser]?: resolver;
    [ResolutionField.bytes]?: resolver;
  };
  logger?: logger;
}

const _defaultLogger = new Logger("fresh-logging-default-logger").addStream(
  new ConsoleStream()
    .withFormat(
      new TokenReplacer()
        .withFormat("{msg}")
        .withColor(),
    ),
);

/**
 * Get a Deno Fresh middleware that log the request / response in Common Log Format.
 *
 * @param options All options are optional.
 * @returns A middleware that logs request / response in the specified format, or a no-op middleware.
 */
export function getLogger(options?: LoggingOpts): MiddlewareHandler {
  const format = options?.format ?? LoggingFormat.COMMON;
  const includeDuration = options?.includeDuration ?? true;
  const resolvers = options?.resolvers ?? {};
  resolvers[ResolutionField.rfc931] = resolvers[ResolutionField.rfc931] ?? (() => "-");
  resolvers[ResolutionField.authuser] = resolvers[ResolutionField.authuser] ?? (() => "-");
  resolvers[ResolutionField.bytes] = resolvers[ResolutionField.bytes] ?? (() => "-");
  const logger = options?.logger ?? _defaultLogger.info.bind(_defaultLogger);

  switch (format) {
    case LoggingFormat.COMMON:
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
        logger(logParts.join(" "));

        return res;
      };
    case LoggingFormat.APACHE_COMBINED:
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
          req.headers.get("Referer") ? `"${req.headers.get("Referer")}"` : "-",
          req.headers.get("User-agent") ? `"${req.headers.get("User-agent")}"` : "-",
          durationText,
        ];
        logger(logParts.join(" "));

        return res;
      };
    default:
      // Returns a empty MiddlewareHandler if log format not support.
      return (_req: Request, ctx: MiddlewareHandlerContext) => ctx.next();
  }
}

export default getLogger;
