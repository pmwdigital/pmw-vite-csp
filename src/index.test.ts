import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { buildCsp, cspPlugin, type CspOptions } from "./index.js";

const DEFAULT_POLICY =
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self' data:; " +
    "img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; " +
    "base-uri 'self'; form-action 'self'";

const EXTRA_TARGETS = [
    ["script", "script-src"],
    ["style", "style-src"],
    ["connect", "connect-src"],
    ["font", "font-src"],
    ["img", "img-src"],
    ["frame", "frame-src"],
] as const;

function directives(options?: CspOptions): Record<string, string> {
    return Object.fromEntries(
        buildCsp(options)
            .split("; ")
            .map((part) => {
                const [name, ...values] = part.split(" ");
                return [name, values.join(" ")];
            }),
    );
}

async function buildPage(options: CspOptions, extraPlugins: Plugin[] = []): Promise<string> {
    const result = await build({
        configFile: false,
        root: "test/fixture",
        logLevel: "silent",
        plugins: [cspPlugin(options), ...extraPlugins],
        build: { write: false },
    });
    const bundle = Array.isArray(result) ? result[0] : result;
    if (!bundle || !("output" in bundle)) throw new Error("vite returned no build output");
    const page = bundle.output.find((item) => item.fileName === "index.html");
    if (!page || page.type !== "asset") throw new Error("vite did not emit index.html");
    return String(page.source);
}

describe("default policy", () => {
    it("allows the own origin and data URIs for images and fonts, nothing else", () => {
        expect(buildCsp()).toBe(DEFAULT_POLICY);
    });

    it("never allows inline or eval in script-src", () => {
        const script = directives()["script-src"];
        expect(script).not.toContain("'unsafe-inline'");
        expect(script).not.toContain("'unsafe-eval'");
    });

    it("blocks frames and objects and locks base and form targets", () => {
        const result = directives();
        expect(result["frame-src"]).toBe("'none'");
        expect(result["object-src"]).toBe("'none'");
        expect(result["base-uri"]).toBe("'self'");
        expect(result["form-action"]).toBe("'self'");
    });
});

describe("extra sources", () => {
    it.each(EXTRA_TARGETS)("%s sources go to %s and nowhere else", (key, directive) => {
        const host = "https://cdn.example.com";
        const options: CspOptions = { [key]: [host] };
        const base = directives();
        const result = directives(options);
        expect(result[directive]).toContain(host);
        for (const [name, value] of Object.entries(result)) {
            if (name !== directive) expect(value).toBe(base[name]);
        }
    });

    it("replaces none in frame-src and does not add self", () => {
        expect(directives({ frame: ["https://embed.example.com"] })["frame-src"]).toBe(
            "https://embed.example.com",
        );
    });

    it("builds the Google Fonts example", () => {
        const result = directives({
            style: ["https://fonts.googleapis.com"],
            font: ["https://fonts.gstatic.com"],
        });
        expect(result["style-src"]).toBe("'self' https://fonts.googleapis.com");
        expect(result["font-src"]).toBe("'self' data: https://fonts.gstatic.com");
    });

    it("builds the API and WebSocket example", () => {
        const result = directives({ connect: ["https://api.example.com", "wss://api.example.com"] });
        expect(result["connect-src"]).toBe("'self' https://api.example.com wss://api.example.com");
    });

    it("builds the inline styles example", () => {
        expect(directives({ style: ["'unsafe-inline'"] })["style-src"]).toBe("'self' 'unsafe-inline'");
    });
});

describe("invalid sources", () => {
    it.each([
        ["undefined", undefined],
        ["an empty string", ""],
        ["whitespace", "https://a.example https://b.example"],
        ["a semicolon", "https://a.example; script-src *"],
        ["a comma", "https://a.example,https://b.example"],
        ["a double quote", 'https://a.example"'],
    ])("rejects %s", (_label, source) => {
        expect(() => buildCsp({ connect: [source as string] })).toThrow(/invalid source in connect/);
    });
});

describe("cspPlugin", () => {
    it("applies to builds only", () => {
        expect(cspPlugin().apply).toBe("build");
    });

    it("injects the policy as the first element of head in a vite build", async () => {
        const options = { connect: ["https://api.example.com"] };
        const html = await buildPage(options);
        const match = /<head>\s*<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
        expect(match?.[1]).toBe(buildCsp(options));
    });

    it("stays first when a later plugin also prepends to head", async () => {
        const rival: Plugin = {
            name: "rival",
            transformIndexHtml: () => [{ tag: "meta", attrs: { name: "rival" }, injectTo: "head-prepend" }],
        };
        const html = await buildPage({}, [rival]);
        const policyAt = html.indexOf("Content-Security-Policy");
        expect(policyAt).toBeGreaterThan(-1);
        expect(policyAt).toBeLessThan(html.indexOf('name="rival"'));
    });

    it("fails the build on an invalid source", async () => {
        await expect(buildPage({ connect: [""] })).rejects.toThrow(/invalid source in connect/);
    });
});
