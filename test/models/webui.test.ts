import { describe, it, expect } from "vitest";
import { TorrentWebUI, resolveClientSpecificSetting } from "../../src/models/webui";
import type { ClientSpecificSettingDescriptor, TorrentAddingResult } from "../../src/models/webui";
import type { TorrentUploadConfig } from "../../src/models/torrent";
import { makeWebUISettings } from "../helpers/fixtures";
import { mockResponse, queueFetch } from "../helpers/fetch-mock";

/**
 * Minimal concrete subclass that exposes the protected helpers so the base
 * class behaviour can be exercised directly.
 */
class TestWebUI extends TorrentWebUI {
    isLabelSupported = true;
    isDirSupported = true;
    isAddPausedSupported = true;

    override get clientSpecificSettingDescriptors(): ReadonlyArray<ClientSpecificSettingDescriptor> {
        return [
            { key: "flagOn", label: "Flag on", type: "boolean", default: true, perTorrent: true },
            { key: "flagOff", label: "Flag off", type: "boolean", default: false, perTorrent: false },
        ];
    }

    async sendTorrent(): Promise<TorrentAddingResult> {
        return { success: true, httpResponseCode: 200, httpResponseBody: null };
    }

    publicGetDirectory(config: TorrentUploadConfig) {
        return this.getDirectory(config);
    }
    publicGetLabel(config: TorrentUploadConfig) {
        return this.getLabel(config);
    }
    publicGetAddPaused(config: TorrentUploadConfig) {
        return this.getAddPaused(config);
    }
    publicGetClientSpecific(key: string, config: TorrentUploadConfig) {
        return this.getClientSpecific(key, config);
    }
    publicAddLeadingAndTrim(part: string) {
        return this.addLeadingAndTrimTrailingSlashes(part);
    }
    publicFetch(url: string, options?: RequestInit) {
        return this.fetch(url, options);
    }
    publicProbeWithBasicAuth(url: string, isAuthenticated?: (response: Response) => boolean) {
        return this.probeWithBasicAuth(url, isAuthenticated);
    }
}

const build = (over = {}) => new TestWebUI(makeWebUISettings(over));

describe("resolveClientSpecificSetting", () => {
    const descriptors: ReadonlyArray<ClientSpecificSettingDescriptor> = [
        { key: "flag", label: "Flag", type: "boolean", default: true, perTorrent: true },
    ];

    it("uses the stored value over the descriptor default", () => {
        expect(resolveClientSpecificSetting("flag", descriptors, { flag: false })).toBe(false);
    });

    it("falls back to the descriptor default when nothing is stored", () => {
        expect(resolveClientSpecificSetting("flag", descriptors, {})).toBe(true);
        expect(resolveClientSpecificSetting("flag", descriptors, undefined)).toBe(true);
    });

    it("uses the per-torrent override over the stored value", () => {
        expect(resolveClientSpecificSetting("flag", descriptors, { flag: false }, { flag: true })).toBe(true);
        expect(resolveClientSpecificSetting("flag", descriptors, { flag: true }, { flag: false })).toBe(false);
    });

    it("returns false for a key no descriptor declares", () => {
        expect(resolveClientSpecificSetting("unknown", descriptors, {})).toBe(false);
    });
});

describe("createBaseUrl", () => {
    it("builds a plain http url with explicit port", () => {
        expect(build({ host: "h", port: 8080, secure: false }).createBaseUrl()).toBe("http://h:8080");
    });

    it("builds an https url", () => {
        expect(build({ host: "h", port: 8443, secure: true }).createBaseUrl()).toBe("https://h:8443");
    });

    it("omits port 80 for insecure connections", () => {
        expect(build({ host: "h", port: 80, secure: false }).createBaseUrl()).toBe("http://h");
    });

    it("omits port 443 for secure connections", () => {
        expect(build({ host: "h", port: 443, secure: true }).createBaseUrl()).toBe("https://h");
    });

    it("omits the port entirely when none is configured", () => {
        expect(build({ host: "h", port: null, secure: false }).createBaseUrl()).toBe("http://h");
        expect(build({ host: "h", port: null, secure: true }).createBaseUrl()).toBe("https://h");
    });

    it("keeps port 443 when not secure", () => {
        expect(build({ host: "h", port: 443, secure: false }).createBaseUrl()).toBe("http://h:443");
    });

    it("appends a normalized relative path", () => {
        expect(build({ host: "h", port: 80, secure: false, relativePath: "rutorrent/" }).createBaseUrl()).toBe(
            "http://h/rutorrent",
        );
    });
});

describe("createBaseUrlPatternForFilter", () => {
    it("ensures exactly one trailing slash", () => {
        expect(build({ host: "h", port: 80 }).createBaseUrlPatternForFilter()).toBe("http://h/");
    });

    it("normalizes a relative path to a single trailing slash", () => {
        const url = build({ host: "h", port: 80, relativePath: "app" }).createBaseUrlPatternForFilter();
        expect(url).toBe("http://h/app/");
    });
});

describe("addLeadingAndTrimTrailingSlashes", () => {
    it("returns empty string for empty input", () => {
        expect(build().publicAddLeadingAndTrim("")).toBe("");
    });

    it("adds a leading slash and trims trailing slashes", () => {
        expect(build().publicAddLeadingAndTrim("path/")).toBe("/path");
        expect(build().publicAddLeadingAndTrim("//a/b//")).toBe("/a/b");
    });
});

describe("config resolution helpers", () => {
    it("getDirectory returns the config dir, or null when it is missing (defaults are resolved upstream)", () => {
        expect(build({ defaultDir: "/def" }).publicGetDirectory({ dir: "/cfg" })).toBe("/cfg");
        expect(build({ defaultDir: "/def" }).publicGetDirectory({})).toBeNull();
    });

    it("getLabel returns the config label, or null when it is missing (defaults are resolved upstream)", () => {
        expect(build({ defaultLabel: "def" }).publicGetLabel({ label: "cfg" })).toBe("cfg");
        expect(build({ defaultLabel: "def" }).publicGetLabel({})).toBeNull();
    });

    it("getAddPaused returns the config value, or false when it is missing (defaults are resolved upstream)", () => {
        expect(build({ addPaused: false }).publicGetAddPaused({ addPaused: true })).toBe(true);
        expect(build({ addPaused: true }).publicGetAddPaused({})).toBe(false);
    });

    it("getClientSpecific prefers config, then the stored setting, then the declared default", () => {
        const stored = { clientSpecificSettings: { flagOff: true } };
        expect(build(stored).publicGetClientSpecific("flagOff", { clientSpecificSettings: { flagOff: false } })).toBe(false);
        expect(build(stored).publicGetClientSpecific("flagOff", {})).toBe(true);
        expect(build({ clientSpecificSettings: {} }).publicGetClientSpecific("flagOff", {})).toBe(false);
        expect(build({ clientSpecificSettings: {} }).publicGetClientSpecific("flagOn", {})).toBe(true);
    });

    it("getClientSpecific lets a stored false override a default of true", () => {
        expect(build({ clientSpecificSettings: { flagOn: false } }).publicGetClientSpecific("flagOn", {})).toBe(false);
    });

    it("getClientSpecific returns false for a key no descriptor declares", () => {
        expect(build({ clientSpecificSettings: {} }).publicGetClientSpecific("unknown", {})).toBe(false);
    });

    it("getClientSpecific tolerates settings saved before clientSpecificSettings existed", () => {
        const settings = makeWebUISettings();
        delete (settings as Partial<typeof settings>).clientSpecificSettings;
        const ui = new TestWebUI(settings);

        expect(ui.publicGetClientSpecific("flagOn", {})).toBe(true);
        expect(ui.publicGetClientSpecific("flagOff", {})).toBe(false);
    });
});

describe("isLabelDirChooserSupported", () => {
    it("is true when any of label/dir/addPaused are supported", () => {
        const ui = build();
        ui.isLabelSupported = false;
        ui.isDirSupported = false;
        ui.isAddPausedSupported = true;
        expect(ui.isLabelDirChooserSupported).toBe(true);
    });

    it("is false when none are supported", () => {
        const ui = build();
        ui.isLabelSupported = false;
        ui.isDirSupported = false;
        ui.isAddPausedSupported = false;
        expect(ui.isLabelDirChooserSupported).toBe(false);
    });
});

describe("fetch", () => {
    it("returns the response when ok", async () => {
        (globalThis as any).fetch = async () => ({ ok: true, status: 200 });
        const res = await build().publicFetch("http://x");
        expect(res.status).toBe(200);
    });

    it("throws an HttpError carrying the status and body on a non-ok response", async () => {
        (globalThis as any).fetch = async () => ({ ok: false, status: 500, text: async () => "boom" });
        await expect(build().publicFetch("http://x")).rejects.toMatchObject({
            message: "HTTP error 500",
            status: 500,
            body: "boom",
        });
    });
});

describe("probeWithBasicAuth", () => {
    const probeWithStatus = (status: number) => {
        queueFetch(mockResponse({ status }));
        return build().publicProbeWithBasicAuth("http://x/");
    };

    it("reports authenticated on a 2xx response", async () => {
        expect(await probeWithStatus(200)).toEqual({
            reachable: true,
            authenticated: true,
            httpResponseCode: 200,
            message: "Reachable & authenticated",
        });
    });

    it("reports an authentication failure on 401 and 403", async () => {
        for (const status of [401, 403]) {
            expect(await probeWithStatus(status)).toMatchObject({ reachable: true, authenticated: false, httpResponseCode: status });
        }
    });

    it("reports reachable but not verified on 404 and 500", async () => {
        for (const status of [404, 500]) {
            expect(await probeWithStatus(status)).toMatchObject({
                reachable: true,
                authenticated: null,
                httpResponseCode: status,
            });
        }
    });

    it("reports reachable but not verified with a message that does not blame the path on 5xx", async () => {
        expect((await probeWithStatus(500)).message).toBe("Reachable, but the server answered HTTP 500; credentials could not be verified");
    });

    it("accepts a response the client itself recognises as authenticated", async () => {
        const isAuthenticated = (response: Response) => response.status === 409;
        queueFetch(mockResponse({ status: 409 }));
        expect(await build().publicProbeWithBasicAuth("http://x/", isAuthenticated)).toMatchObject({ reachable: true, authenticated: true });
    });
});
