import { describe, it, expect, vi, beforeEach } from "vitest";
import { callArgs } from "../helpers/assert";

// Stub out the Add module so we can observe what each click asks for.
const { addLink } = vi.hoisted(() => ({
    addLink: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../src/background/add", () => ({ addLink }));

import { refreshContextMenu, registerContextMenuClickListener } from "../../src/background/context-menu";
import { QBittorrentWebUI } from "../../src/webuis/qbittorrent";
import { makeWebUISettings, seedWebUISettings } from "../helpers/fixtures";

const settingsFor = (id: string, name: string) => makeWebUISettings({ id, name, host: "h", port: 8080 });
const webUi = (id: string, name: string) => new QBittorrentWebUI(settingsFor(id, name));

const clickData = (menuItemId: string): any => ({ menuItemId, linkUrl: "http://x/file.torrent" });
const tab: any = { windowId: 11 };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function clickListener() {
    const calls = (chrome.contextMenus.onClicked.addListener as any).mock.calls;
    return calls[calls.length - 1][0];
}

/** Registers the listener, then fires one menu click. */
async function click(menuItemId: string) {
    registerContextMenuClickListener();
    clickListener()(clickData(menuItemId), tab);
    await flush();
}

beforeEach(() => {
    addLink.mockClear();
});

describe("refreshContextMenu", () => {
    it("creates only the parent menu for a single webui", async () => {
        await refreshContextMenu([webUi("a", "Server A")]);
        const created = (chrome.contextMenus.create as any).mock.calls.map((c: any[]) => c[0].id);
        expect(created).toEqual(["server-main"]);
    });

    it("creates per-webui, separator and send-all entries for multiple webuis", async () => {
        await refreshContextMenu([webUi("a", "Server A"), webUi("b", "Server B")]);
        const created = (chrome.contextMenus.create as any).mock.calls.map((c: any[]) => c[0].id);
        expect(created).toContain("server-webui-a");
        expect(created).toContain("server-webui-b");
        expect(created).toContain("sendall-separator");
        expect(created).toContain("server-all");
    });

    it("lists the per-webui entries in the order the webuis are given", async () => {
        await refreshContextMenu([webUi("a", "Server A"), webUi("b", "Server B"), webUi("c", "Server C")]);
        const perServer = (chrome.contextMenus.create as any).mock.calls
            .map((c: any[]) => c[0])
            .filter((item: any) => item.id.startsWith("server-webui-"));
        expect(perServer.map((item: any) => item.title)).toEqual(["Server A", "Server B", "Server C"]);
    });

    it("waits for the previous menu to be cleared before creating anything", async () => {
        const order: string[] = [];
        let resolveRemoveAll: () => void = () => undefined;
        (chrome.contextMenus.removeAll as any).mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    order.push("removeAll:start");
                    resolveRemoveAll = () => {
                        order.push("removeAll:done");
                        resolve();
                    };
                }),
        );
        (chrome.contextMenus.create as any).mockImplementation((opts: any) => {
            order.push(`create:${opts.id}`);
            return opts.id;
        });

        const refreshed = refreshContextMenu([webUi("a", "A")]);
        await flush();
        expect(order).toEqual(["removeAll:start"]);

        resolveRemoveAll();
        await refreshed;

        expect(order).toEqual(["removeAll:start", "removeAll:done", "create:server-main"]);
    });

    it("serializes concurrent refreshes so ids are never created twice", async () => {
        const order: string[] = [];
        const pendingRemoveAlls: (() => void)[] = [];
        (chrome.contextMenus.removeAll as any).mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    order.push("removeAll");
                    pendingRemoveAlls.push(resolve);
                }),
        );
        (chrome.contextMenus.create as any).mockImplementation((opts: any) => {
            order.push(`create:${opts.id}`);
            return opts.id;
        });

        const first = refreshContextMenu([webUi("a", "A")]);
        const second = refreshContextMenu([webUi("a", "A")]);
        await flush();

        expect(pendingRemoveAlls).toHaveLength(1);
        pendingRemoveAlls[0]!();
        await first;
        await flush();

        pendingRemoveAlls[1]!();
        await second;

        expect(order).toEqual(["removeAll", "create:server-main", "removeAll", "create:server-main"]);
    });

    it("reports a failed menu creation instead of swallowing it", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        (chrome.contextMenus.create as any).mockImplementation((opts: any, cb?: () => void) => {
            (chrome.runtime as any).lastError = { message: "Cannot create item with duplicate id" };
            cb?.();
            (chrome.runtime as any).lastError = undefined;
            return opts.id;
        });

        await refreshContextMenu([webUi("a", "A")]);

        expect(consoleError).toHaveBeenCalledWith(
            "Failed creating context menu item server-main",
            "Cannot create item with duplicate id",
        );
        consoleError.mockRestore();
    });
});

describe("registerContextMenuClickListener", () => {
    it("registers the listener without needing any settings loaded first", () => {
        registerContextMenuClickListener();
        expect(chrome.contextMenus.onClicked.addListener).toHaveBeenCalledTimes(1);
        expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    it("adds to the Primary WebUI on the main entry", async () => {
        await click("server-main");

        expect(addLink).toHaveBeenCalledTimes(1);
        expect(callArgs(addLink, 0)[0]).toBe("http://x/file.torrent");
        expect(callArgs(addLink, 0)[1]).toEqual({});
        expect(callArgs(addLink, 0)[2]).toEqual(expect.objectContaining({ windowId: 11 }));
    });

    it("adds to the webui the clicked per-webui entry names", async () => {
        await click("server-webui-b");

        expect(addLink).toHaveBeenCalledTimes(1);
        expect(callArgs(addLink, 0)[1]).toEqual({ webUiId: "b" });
    });

    it("adds to every webui on send-all in a single call, so the link is downloaded once", async () => {
        await click("server-all");

        expect(addLink).toHaveBeenCalledTimes(1);
        expect(callArgs(addLink, 0)[1]).toEqual({ sendToAll: true });
    });

    it("loads no settings on a click, leaving that to the Add module", async () => {
        seedWebUISettings([settingsFor("a", "A")]);
        vi.mocked(chrome.storage.local.get).mockClear();

        await click("server-main");

        expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    it("passes no window when the click carries no tab", async () => {
        registerContextMenuClickListener();
        clickListener()(clickData("server-main"), undefined);
        await flush();

        expect(callArgs(addLink, 0)[2]).toEqual(expect.objectContaining({ windowId: undefined }));
    });

    it("ignores clicks on unrelated menu entries", async () => {
        await click("some-other-extension-item");

        expect(addLink).not.toHaveBeenCalled();
    });

    it("logs a rejected add and shows no notification of its own, since the Add module reports it", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        addLink.mockRejectedValueOnce(new Error("storage is down"));

        await click("server-main");

        expect(consoleError).toHaveBeenCalledWith(
            "Context menu click failed",
            expect.objectContaining({ message: "storage is down" }),
        );
        expect(chrome.notifications.create).not.toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
