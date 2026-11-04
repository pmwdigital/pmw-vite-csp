import type { Plugin } from "vite";

export interface CspOptions {
    script?: readonly string[];
    style?: readonly string[];
    connect?: readonly string[];
    font?: readonly string[];
    img?: readonly string[];
    frame?: readonly string[];
}

const VALID_SOURCE = /^[^\s;,"]+$/;

function extraSources(options: CspOptions, key: keyof CspOptions): readonly string[] {
    const sources = options[key] ?? [];
    for (const source of sources) {
        if (typeof source !== "string" || !VALID_SOURCE.test(source)) {
            throw new Error(`[pmw-vite-csp] invalid source in ${key}: ${JSON.stringify(source)}`);
        }
    }
    return sources;
}

export function buildCsp(options: CspOptions = {}): string {
    const frame = extraSources(options, "frame");
    const directives: Record<string, readonly string[]> = {
        "default-src": ["'self'"],
        "script-src": ["'self'", ...extraSources(options, "script")],
        "style-src": ["'self'", ...extraSources(options, "style")],
        "font-src": ["'self'", "data:", ...extraSources(options, "font")],
        "img-src": ["'self'", "data:", ...extraSources(options, "img")],
        "connect-src": ["'self'", ...extraSources(options, "connect")],
        "frame-src": frame.length ? frame : ["'none'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
    };

    return Object.entries(directives)
        .map(([name, values]) => `${name} ${values.join(" ")}`)
        .join("; ");
}

export function cspPlugin(options: CspOptions = {}): Plugin {
    return {
        name: "pmw-vite-csp",
        apply: "build",
        transformIndexHtml: {
            order: "post",
            handler() {
                return [
                    {
                        tag: "meta",
                        attrs: {
                            "http-equiv": "Content-Security-Policy",
                            content: buildCsp(options),
                        },
                        injectTo: "head-prepend",
                    },
                ];
            },
        },
    };
}
