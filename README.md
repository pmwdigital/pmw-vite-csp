# @pmwdigital/vite-csp

A Vite plugin that builds a Content-Security-Policy and injects it into your HTML as a meta tag during `vite build`. The default policy allows your own origin only, apart from `data:` URIs for images and fonts, and you add third-party hosts per directive. It has no runtime dependencies.

A meta tag needs no server configuration, so it fits static hosting. If you control the response headers, see [Limits](#limits).

## Install

```bash
npm install github:pmwdigital/pmw-vite-csp
```

Vite 5, 6, 7 and 8 are supported as a peer dependency.

## Usage

In `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { cspPlugin } from "@pmwdigital/vite-csp";

export default defineConfig({
    plugins: [cspPlugin()],
});
```

`vite build` then writes the tag at the top of `<head>` in the built `index.html`:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; ...">
```

The plugin runs on `vite build` only and leaves the dev server alone. Dev servers inject inline scripts (React Fast Refresh does), which `script-src 'self'` blocks.

## Default policy

```text
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
```

- Scripts, styles and connections come from your own origin. Inline scripts and `eval` are blocked.
- Images and fonts also allow `data:` URIs, because Vite inlines small assets as data URIs by default (`build.assetsInlineLimit`).
- Frames and plugins are blocked. `base-uri` and `form-action` are limited to your own origin.
- Directives that are not listed, such as `media-src`, fall back to `default-src`.

## Adding sources

Each option is a list of CSP source expressions that is appended to one directive.

| Option | Directive |
| --- | --- |
| `script` | `script-src` |
| `style` | `style-src` |
| `connect` | `connect-src` |
| `font` | `font-src` |
| `img` | `img-src` |
| `frame` | `frame-src` |

Google Fonts:

```ts
cspPlugin({
    style: ["https://fonts.googleapis.com"],
    font: ["https://fonts.gstatic.com"],
});
```

This gives `style-src 'self' https://fonts.googleapis.com` and `font-src 'self' data: https://fonts.gstatic.com`.

An API with WebSockets:

```ts
cspPlugin({
    connect: ["https://api.example.com", "wss://api.example.com"],
});
```

A `https://` source does not cover `wss://` requests, so list both. Use an origin such as `https://api.example.com`: a path in a source restricts it to that path.

Inline styles:

```ts
cspPlugin({ style: ["'unsafe-inline'"] });
```

`style-src` is `'self'` by default, so inline `style` attributes and `<style>` elements are blocked. Add `'unsafe-inline'` only if your page needs them.

`frame-src` is `'none'` until you add frame sources. Once you do, only those sources are allowed, so add `"'self'"` as well if you embed your own pages.

Values from the environment:

```ts
import { defineConfig, loadEnv } from "vite";
import { cspPlugin } from "@pmwdigital/vite-csp";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "VITE_");
    return {
        plugins: [cspPlugin({ connect: [env.VITE_API_URL] })],
    };
});
```

A source must be one non-empty token without whitespace, `;`, `,` or `"`, so a value cannot change the structure of the policy. An unset or empty variable fails the build with `invalid source in connect` instead of producing a policy that silently blocks the API.

## API

- `cspPlugin(options?)` returns the Vite plugin. It is named `pmw-vite-csp`, applies to builds only, and its HTML hook runs after the hooks of other plugins, so its tag stays first in `<head>`.
- `buildCsp(options?)` returns the policy as a string.
- `CspOptions` is the type of the options object.

## Limits

- A policy in a meta tag cannot use `frame-ancestors`, `report-uri` or `sandbox`, and `Content-Security-Policy-Report-Only` does not work in a meta tag. If you control the server, send the policy as an HTTP header instead. `buildCsp()` returns the same policy as a string, so you can use it as the header value and append directives such as `frame-ancestors 'none'`.
- A meta policy only applies to content that comes after it. The plugin puts the tag first in `<head>`, but anything that loads before the tag is parsed, such as a resource named in a `Link` response header, is not covered.
- The tag sits ahead of `<meta charset>`, and browsers expect that declaration within the first 1024 bytes of the document. A long policy can push it past that point. This does not matter if your server sends `charset=utf-8` in the Content-Type header.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

The tests run real `vite build` calls on a one-page fixture and check where the tag lands.

## License

MIT
