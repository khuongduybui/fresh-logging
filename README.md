# fresh-logging

[Access Log](https://www.w3.org/Daemon/User/Config/Logging.html#common-logfile-format) [middleware](https://fresh.deno.dev/docs/concepts/middleware) for
[Deno Fresh](https://fresh.deno.dev/).

## Installation

First of all, create [your fresh app](https://fresh.deno.dev/docs/getting-started/create-a-project).

Add logging to your `import_map.json`.

```json
{
  "imports": {
    "$logging/": "https://deno.land/x/fresh_logging@0.0.2/"
  }
}
```

Consume the logger in your app's `_middleware.ts`.

```ts
import { getLogger } from "$logging/index.ts";

export const handler = [
  getLogger(),
  // ... other middlewares
];
```

**Note**: if `includeDuration` option is ON (which is the default behavior), `getLogger()` will also count the time taken by all of its subsequent middlewares.
For example, putting `getLogger()` at the beginning of your `handler` array will count the time taken by all middlewares, while putting it at the very end of
your `handler` array will yield the time taken only by the route handler.

## Options

`getLogger()` accepts an optional object `{}` with the following options:

| Option            | Default Value           | Notes                                                                                                                                      |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `format`          | `LoggingFormat.DEFAULT` | Default format to use, v0.0.1 only supports [Common Log Format](https://www.w3.org/Daemon/User/Config/Logging.html#common-logfile-format). |
| `utcTime`         | `false`                 | Whether to log timestamps in UTC or server timezone.                                                                                       |
| `includeDuration` | `true`                  | Whether to include handler response time.                                                                                                  |

## Limitations

As of v0.0.1, the following fields are **completely** omitted (hard-coded to `-`):

- `rfc931` (client identifier): not sure how to obtain this
- `authuser` (user identifier): not sure how to obtain this either
- `bytes` (response content length): one way I can think of is to use `res.clone()` then read its as `ArrayBuffer` and get the `byteLength`, but that is both
  time and memory consuming. Until I can find a more efficient way to obtain this piece of information, omission is the decision.

From v0.0.2, a `resolvers` option has been added to allow custom resolutions of all the fields, including the missing ones above. For example, the following
code snippet will allow logging the response bytes:

```ts
import { getLogger, ResolutionField } from "$logging/index.ts";

export const handler = [
  getLogger({
    resolvers: {
      [ResolutionField.bytes]: async (_req, _ctx, res) => `${(await res.clone().arrayBuffer()).byteLength}`,
    },
  }),
];
```

Again, please note that the example above only serves to illustrate how to provide customer resolvers for the missing fields, the actual implementation is
sub-optimal. Otherwise, it would have been included as default resolver for that field.

## A note about versioning

For now, the versions are `a.b.c-x.y.z` where `a.b.c` is the plugin version and `x.y.z` is the supported Turnstile API version. For example, `0.0.1-0` is the
initial release of plugin, which supports Turnstile API v0.

All tags starting with `0.0.` are **mutable**. Expect breaking changes! Starting from `0.1.`, tags will be **immutable**. However, still expect breaking
changes. Starting from `1.`, semver will kick in and there will be no breaking changes until `2.`.
