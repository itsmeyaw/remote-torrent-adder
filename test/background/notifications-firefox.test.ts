import { describe, it, expect, vi, beforeEach } from "vitest";

const { playNotificationSound } = vi.hoisted(() => ({
    playNotificationSound: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/util/platform", () => ({
    BROWSER: "firefox",
    isFirefox: () => true,
    canUseOffscreen: () => false,
}));

vi.mock("../../src/notifications/play-sound", () => ({ playNotificationSound }));

vi.mock("../../src/torrent/info-hash", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, computeInfoHash: vi.fn(actual.computeInfoHash as () => Promise<string | null>) };
});

import { computeInfoHash } from "../../src/torrent/info-hash";
import { WebUIFactory, Client } from "../../src/models/clients";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { makeMagnetTorrent, makeWebUISettings } from "../helpers/fixtures";

const { notify } = await import("../../src/background/notifications");

const qbit = WebUIFactory.createWebUI(makeWebUISettings({ id: "w1", name: "qBit", client: Client.QBittorrentWebUI, host: "h", port: 8080 }))!;

describe("notify without an offscreen API", () => {
    beforeEach(() => {
        playNotificationSound.mockClear();
        vi.mocked(computeInfoHash).mockClear();
    });

    it("plays the sound in-process instead of spawning an offscreen document", async () => {
        await notify({ type: "test", isFailed: false }, { ...getDefaultSettings(), notificationsSoundEnabled: true });

        expect(playNotificationSound).toHaveBeenCalledWith(false);
        expect(chrome.offscreen.hasDocument).not.toHaveBeenCalled();
        expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
    });

    it("still shows the notification itself", async () => {
        await notify({ type: "addFailed", reason: "nope" }, getDefaultSettings());

        expect(chrome.notifications.create).toHaveBeenCalled();
        expect(playNotificationSound).not.toHaveBeenCalled();
    });

    it("leaves the add-label button off without computing the info hash, since firefox rejects notifications with buttons", async () => {
        const torrent = makeMagnetTorrent({ data: "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567", name: "Cool" });
        await notify({ type: "added", webUi: qbit, torrent }, getDefaultSettings());
        await vi.waitFor(() => expect(chrome.storage.session.set).toHaveBeenCalled());

        expect((chrome.notifications.create as any).mock.calls[0][1].buttons).toBeUndefined();
        expect(computeInfoHash).not.toHaveBeenCalled();
        expect(chrome.storage.session.set).toHaveBeenCalledWith({ "notificationLink:notif-id": { webUiId: "w1" } });
        expect(chrome.storage.session.set).toHaveBeenCalledTimes(1);
    });
});
