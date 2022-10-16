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
  combinedHeaders?: string[];
}

const _defaultLogger = new Logger("fresh-logging-default-logger").addStream(
  new ConsoleStream()
    .withFormat(
      new TokenReplacer()
        .withFormat("{msg}")
        .withColor(),
    ),
);

const _durationCalculator = async (callable: () => Promise<unknown>) => {
  const start = performance.now();
  const res = await callable();
  const end = performance.now();
  const duration = (end - start).toFixed(1);
  return [duration, res];
};

/**
 * Get a Deno Fresh middleware that log the request / response in Common Log Format.
 *
 * @param options All options are optional.
 * @returns A middleware that logs request / response in the specified format, or a no-op middleware.
 */
export function getLogger(options?: LoggingOpts): MiddlewareHandler {
  // Populate default values for options
  const format = options?.format ?? LoggingFormat.COMMON;
  const includeDuration = options?.includeDuration ?? false;
  const resolvers = options?.resolvers ?? {};
  const logger = options?.logger ?? _defaultLogger.info.bind(_defaultLogger);
  const combinedHeaders = options?.combinedHeaders ?? ["Referer", "User-agent"];

  // Resolvers
  const noopResolver = ((_req: Request, _ctx: MiddlewareHandlerContext, _res: Response) => "-");
  resolvers[ResolutionField.rfc931] = resolvers[ResolutionField.rfc931] ?? noopResolver;
  resolvers[ResolutionField.authuser] = resolvers[ResolutionField.authuser] ?? noopResolver;
  resolvers[ResolutionField.bytes] = resolvers[ResolutionField.bytes] ?? noopResolver;

  const remoteIpResolver = (_req: Request, ctx: MiddlewareHandlerContext, _res: Response) => (ctx.remoteAddr as Deno.NetAddr).hostname;

  const durationResolver = async (_req: Request, ctx: MiddlewareHandlerContext) => {
    const [duration, res] = await _durationCalculator(() => ctx.next()) as [string, Response];
    let durationText = "";
    if (includeDuration) {
      res.headers.set("Server-Timing", `handler;dur=${duration}`);
      durationText = `${duration}ms`;
    }
    return [durationText, res];
  };

  const timestampResolver = (_req: Request, _ctx: MiddlewareHandlerContext, _res: Response) => {
    const now = options?.utcTime ? DateTime.utc() : DateTime.now();
    return `[${now.toFormat("dd/MMM/yyyy:HH:mm:ss ZZZ")}]`;
  };

  const methodResolver = (req: Request, _ctx: MiddlewareHandlerContext, _res: Response) => req.method;

  const urlResolver = (req: Request, _ctx: MiddlewareHandlerContext, _res: Response) => req.url;

  const statusResolver = (_req: Request, _ctx: MiddlewareHandlerContext, res: Response) => res.status;

  const headerResolver = (req: Request, _ctx: MiddlewareHandlerContext, _res: Response, header: string) =>
    req.headers.has(header) ? `"${req.headers.get(header)}"` : "-";

  const commonLogPartsResolver = async (req: Request, ctx: MiddlewareHandlerContext) => {
    const [durationText, res] = await durationResolver(req, ctx) as [string, Response];
    const logParts = [
      remoteIpResolver(req, ctx, res),
      await resolvers[ResolutionField.rfc931]?.(req, ctx, res),
      await resolvers[ResolutionField.authuser]?.(req, ctx, res),
      timestampResolver(req, ctx, res),
      methodResolver(req, ctx, res),
      urlResolver(req, ctx, res),
      statusResolver(req, ctx, res),
      await resolvers[ResolutionField.bytes]?.(req, ctx, res),
    ];
    return [durationText, res, logParts];
  };

  // Building log entry according to format
  switch (format) {
    case LoggingFormat.COMMON:
      return async (req: Request, ctx: MiddlewareHandlerContext): Promise<Response> => {
        const [durationText, res, commonLogParts] = await commonLogPartsResolver(req, ctx) as [string, Response, string[]];
        const logParts = commonLogParts
          .concat([durationText]);
        logger(logParts.join(" "));
        return res;
      };
    case LoggingFormat.APACHE_COMBINED:
      return async (req: Request, ctx: MiddlewareHandlerContext): Promise<Response> => {
        const [durationText, res, commonLogParts] = await commonLogPartsResolver(req, ctx) as [string, Response, string[]];
        const logParts = commonLogParts
          .concat(combinedHeaders.slice(0, 2).map((header) => headerResolver(req, ctx, res, header)))
          .concat([durationText]);
        logger(logParts.join(" "));
        return res;
      };
    default:
      // Returns a empty MiddlewareHandler if log format not support.
      return (_req: Request, ctx: MiddlewareHandlerContext) => ctx.next();
  }
}

export default getLogger;
