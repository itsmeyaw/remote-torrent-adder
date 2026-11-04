import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { SETTINGS_KEY, loadSettings, saveSettings } from "../src/settings/settings";
import { notify } from "../src/background/notifications";
import { makeMagnetTorrent, makeWebUISettings, seedWebUISettings } from "./helpers/fixtures";
import { readBufferedTorrent, saveBufferedTorrent } from "../src/background/buffered-torrent";

vi.mock("../src/background/notifications", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notify: vi.fn(() => Promise.resolve()),
}));

/**
 * Boots the real service worker entrypoint, side effects and all. The module
 * registry is reset first so each test gets a fresh set of listener
 * registrations against the current chrome mock.
 *
 * The lifecycle event is dispatched as soon as its listener registers, because
 * Chrome starts the worker *in order to* deliver it: the handler runs while the
 * module's own top-level startup work is still in flight. Firing it after an
 * await instead would let that work drain first and hide every race against it.
 */
async function bootServiceWorker(
    event: "installed" | "startup" | "none" = "installed",
    installReason: chrome.runtime.OnInstalledReason = "install" as chrome.runtime.OnInstalledReason,
): Promise<void> {
    if (event !== "none") {
        const registration =
            event === "installed" ? chrome.runtime.onInstalled.addListener : chrome.runtime.onStartup.addListener;
        (registration as any).mockImplementation((listener: (details: chrome.runtime.InstalledDetails) => void) =>
            queueMicrotask(() => listener({ reason: installReason } as chrome.runtime.InstalledDetails)),
        );
    }

    vi.resetModules();
    await import("../src/service_worker");
    await settle();
}

/**
 * Drains pending microtasks and timers. Booting fans out into several
 * independent promise chains (settings load, menu rebuild, CORS rules), so a
 * single await is not enough to let them all finish racing.
 */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

function fireLifecycleEvent(event: { addListener: { mock: { calls: any[][] } } }): void {
    event.addListener.mock.calls.forEach(([listener]) => listener());
}

/**
 * Ids Chrome refused because it was already holding them — the exact condition
 * behind "Cannot create item with duplicate id". Recreating an id *after* a
 * removeAll is legitimate, so only genuine collisions land here.
 */
function duplicateMenuIds(): string[] {
    return (chrome as any).__rejectedMenuIds;
}

function rebuildCount(): number {
    return (chrome.contextMenus.removeAll as any).mock.calls.length;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

describe("service worker boot on an unconfigured profile", () => {
    it("logs nothing to console.error", async () => {
        await bootServiceWorker();

        expect(consoleError).not.toHaveBeenCalled();
    });

    it("never creates the same context menu id twice", async () => {
        await bootServiceWorker();

        expect(duplicateMenuIds()).toEqual([]);
    });

    it("persists default settings so later boots are not unconfigured", async () => {
        await bootServiceWorker();

        expect((chrome as any).__storage[SETTINGS_KEY]).toBeDefined();
    });

    // Writing the defaults re-enters through storage.onChanged, so the menu is
    // built more than once. Harmless, but this pins the current cost.
    it("rebuilds the menu more than once because writing defaults re-triggers it", async () => {
        await bootServiceWorker();

        expect(rebuildCount()).toBeGreaterThan(1);
    });

    it("leaves a single usable parent entry in the menu", async () => {
        await bootServiceWorker();

        expect([...(chrome as any).__contextMenuIds]).toEqual(["server-main"]);
    });
});

describe("service worker boot on a configured profile", () => {
    it("creates one entry per configured webui without duplicates", async () => {
        seedWebUISettings([
            makeWebUISettings({ id: "a", name: "Server A" }),
            makeWebUISettings({ id: "b", name: "Server B" }),
        ]);

        await bootServiceWorker();

        expect(consoleError).not.toHaveBeenCalled();
        expect(duplicateMenuIds()).toEqual([]);
        expect([...(chrome as any).__contextMenuIds]).toEqual([
            "server-main",
            "server-webui-a",
            "server-webui-b",
            "sendall-separator",
            "server-all",
        ]);
    });

    it("survives a browser restart rebuilding the menu on top of an existing one", async () => {
        seedWebUISettings([makeWebUISettings({ id: "a", name: "Server A" })]);

        await bootServiceWorker();
        fireLifecycleEvent(chrome.runtime.onStartup as any);
        await settle();

        expect(consoleError).not.toHaveBeenCalled();
        expect([...(chrome as any).__contextMenuIds]).toEqual(["server-main"]);
    });

    it("rebuilds without duplicates when settings change while running", async () => {
        seedWebUISettings([makeWebUISettings({ id: "a", name: "Server A" })]);

        await bootServiceWorker();

        const loaded = await loadSettings();
        loaded.webuiSettings = [
            makeWebUISettings({ id: "a", name: "Server A" }),
            makeWebUISettings({ id: "b", name: "Server B" }),
        ];
        await saveSettings(loaded);
        await settle();

        expect(consoleError).not.toHaveBeenCalled();
        expect([...(chrome as any).__contextMenuIds]).toEqual([
            "server-main",
            "server-webui-a",
            "server-webui-b",
            "sendall-separator",
            "server-all",
        ]);
    });
});

describe("service worker when a settings backup is written", () => {
    function fireStorageChange(changes: Record<string, chrome.storage.StorageChange>): void {
        (chrome.storage.local.onChanged.addListener as any).mock.calls.forEach(
            ([listener]: [(changes: Record<string, chrome.storage.StorageChange>) => void]) => listener(changes),
        );
    }

    beforeEach(() => {
        vi.mocked(notify).mockClear();
    });

    it("tells the user once that settings were reset when a new backup key appears", async () => {
        await bootServiceWorker("none");

        fireStorageChange({ "settingsBackup:1": { newValue: "{corrupt" } });
        await settle();

        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith({ type: "settingsReset" }, expect.anything());
    });

    it("does not tell the user again when an existing backup key changes", async () => {
        await bootServiceWorker("none");

        fireStorageChange({ "settingsBackup:1": { oldValue: "{corrupt", newValue: "{corrupt" } });
        await settle();

        expect(notify).not.toHaveBeenCalled();
    });

    it("does not tell the user when a backup key is removed", async () => {
        await bootServiceWorker("none");

        fireStorageChange({ "settingsBackup:1": { oldValue: "{corrupt" } });
        await settle();

        expect(notify).not.toHaveBeenCalled();
    });

    it("ignores changes to other keys", async () => {
        await bootServiceWorker("none");

        fireStorageChange({ "notificationLink:1": { newValue: "{}" } });
        await settle();

        expect(notify).not.toHaveBeenCalled();
    });
});

describe("service worker startup when dynamic CORS rules cannot be cleared", () => {
    it("logs the failure instead of leaving it unhandled", async () => {
        (chrome.declarativeNetRequest.getDynamicRules as any).mockRejectedValue(new Error("storage is down"));

        await bootServiceWorker("startup");

        expect(consoleError).toHaveBeenCalledWith("Failed to clear dynamic CORS rules", expect.any(Error));
    });
});

describe("updating the extension", () => {
    it("drops Buffered Torrents parked by an older version, which held a copy of the WebUI with its password", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiId: "w1" });

        await bootServiceWorker("installed", "update" as chrome.runtime.OnInstalledReason);

        await vi.waitFor(async () => expect(await readBufferedTorrent(id)).toBeNull());
    });

    it("keeps Buffered Torrents on a fresh install", async () => {
        const id = await saveBufferedTorrent({ torrent: makeMagnetTorrent(), webUiId: "w1" });

        await bootServiceWorker("installed");

        expect(await readBufferedTorrent(id)).not.toBeNull();
    });
});
