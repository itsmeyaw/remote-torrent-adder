import { describe, it, expect } from "vitest";
import { callArgs } from "../helpers/assert";
import { BiglyBTWebUI } from "../../src/webuis/biglybt-webui";
import { makeWebUISettings, makeMagnetTorrent, makeFileTorrent } from "../helpers/fixtures";
import { mockResponse, queueFetch } from "../helpers/fetch-mock";

const build = (over = {}) => new BiglyBTWebUI(makeWebUISettings({ host: "h", port: 9091, ...over }));

describe("BiglyBTWebUI", () => {
    it("reports authenticated when the rpc endpoint answers 409 with a session id", async () => {
        queueFetch(mockResponse({ status: 409, headers: { "X-Transmission-Session-Id": "sess-123" } }));
        await expect(build().testConnection()).resolves.toMatchObject({ reachable: true, authenticated: true });
    });

    it("reports an authentication failure when the rpc endpoint answers 401", async () => {
        queueFetch(mockResponse({ status: 401 }));
        await expect(build().testConnection()).resolves.toMatchObject({ reachable: true, authenticated: false });
    });

    it("targets the rpc endpoint for magnets and sends torrent-add json", async () => {
        const fetch = queueFetch(
            mockResponse({ status: 200 }), // session cookie
            mockResponse({ status: 200, json: { result: "success" } }),
        );
        const result = await build().sendTorrent(makeMagnetTorrent(), { addPaused: true });

        expect(result.success).toBe(true);
        const [url, opts] = callArgs(fetch, 1);
        expect(url).toBe("http://h:9091/transmission/rpc");
        const payload = JSON.parse(opts.body as string);
        expect(payload.method).toBe("torrent-add");
        expect(payload.arguments.filename).toBe("magnet:?xt=urn:btih:abc123&dn=Cool+Torrent");
    });

    it("targets the upload endpoint with paused query for a paused file torrent", async () => {
        const fetch = queueFetch(
            mockResponse({ status: 200 }),
            mockResponse({ status: 200, body: "<h1>200: OK</h1>" }),
        );
        const result = await build().sendTorrent(makeFileTorrent(), { addPaused: true });

        expect(result.success).toBe(true);
        expect(callArgs(fetch, 1)[0]).toBe("http://h:9091/transmission/upload?paused=true");
        expect(callArgs(fetch, 1)[1].body).toBeInstanceOf(FormData);
    });

    it("recognizes a JSON success body", async () => {
        queueFetch(mockResponse({ status: 200 }), mockResponse({ status: 200, json: { result: "success" } }));
        const result = await build().sendTorrent(makeFileTorrent(), {});
        expect(result.success).toBe(true);
    });

    it("reports failure when the add response is neither OK html nor JSON success", async () => {
        queueFetch(mockResponse({ status: 200 }), mockResponse({ status: 200, json: { result: "fail" } }));
        await expect(build().sendTorrent(makeFileTorrent(), {})).resolves.toMatchObject({ success: false });
    });

    it("supports labels and add-paused", () => {
        const ui = build();
        expect(ui.isLabelSupported).toBe(true);
        expect(ui.isDirSupported).toBe(false);
        expect(ui.isAddPausedSupported).toBe(true);
    });
    it("sets the label with torrent-set after adding a magnet, using the upper-cased info hash", async () => {
        const fetch = queueFetch(
            mockResponse({ status: 200 }),
            mockResponse({ status: 200, json: { result: "success" } }),
            mockResponse({ status: 409, headers: { "X-Transmission-Session-Id": "sess-1" } }),
            mockResponse({ status: 200, json: { result: "success" } }),
        );
        const result = await build().sendTorrent(makeMagnetTorrent({ data: `magnet:?xt=urn:btih:${"0123456789abcdef0123456789abcdef01234567"}` }), { label: "movies" });

        expect(result.success).toBe(true);
        const [url, opts] = callArgs(fetch, 3);
        expect(url).toBe("http://h:9091/transmission/rpc");
        expect((opts.headers as any)["X-Transmission-Session-Id"]).toBe("sess-1");
        expect(JSON.parse(opts.body as string)).toEqual({ method: "torrent-set", arguments: { ids: ["0123456789abcdef0123456789abcdef01234567".toUpperCase()], labels: ["movies"] } });
    });

    it("adds without the label when the info hash cannot be determined", async () => {
        const fetch = queueFetch(mockResponse({ status: 200 }), mockResponse({ status: 200, json: { result: "success" } }));
        const result = await build().sendTorrent(makeMagnetTorrent(), { label: "movies" });

        expect(result.success).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("reports failure when torrent-set does not succeed", async () => {
        queueFetch(mockResponse({ status: 200 }), mockResponse({ status: 200, json: { result: "error" } }));
        await expect(build().setLabel("0123456789abcdef0123456789abcdef01234567", "movies")).resolves.toMatchObject({ success: false });
    });

    it("reports the real status and body when the session cookie request is rejected", async () => {
        const fetch = queueFetch(mockResponse({ status: 403, body: "forbidden" }));
        await expect(build().sendTorrent(makeMagnetTorrent(), {})).resolves.toEqual({
            success: false,
            httpResponseCode: 403,
            httpResponseBody: "forbidden",
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("reports the real status and body when the session cookie request fails while setting a label", async () => {
        queueFetch(mockResponse({ status: 500, body: "server error" }));
        await expect(build().setLabel("0123456789abcdef0123456789abcdef01234567", "movies")).resolves.toEqual({
            success: false,
            httpResponseCode: 500,
            httpResponseBody: "server error",
        });
    });
});
