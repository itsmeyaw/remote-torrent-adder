import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { requestSettings } from "../../src/settings/request-settings";
import { serializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";

describe("requestSettings", () => {
    const serialized = serializeSettings({ ...getDefaultSettings(), notificationsDurationMs: 4321 });

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("resolves with the deserialized settings on the first attempt", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ value: serialized });

        expect((await requestSettings())?.notificationsDurationMs).toBe(4321);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "getSettings" });
        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("retries when the service worker rejects because it is asleep", async () => {
        let attempts = 0;
        (chrome.runtime.sendMessage as any).mockImplementation(() => {
            attempts += 1;
            return attempts < 3
                ? Promise.reject(new Error("Could not establish connection."))
                : Promise.resolve({ value: serialized });
        });

        const pending = requestSettings();
        await vi.runAllTimersAsync();

        expect((await pending)?.notificationsDurationMs).toBe(4321);
        expect(attempts).toBe(3);
    });

    it("retries a reply that is not an envelope", async () => {
        let attempts = 0;
        (chrome.runtime.sendMessage as any).mockImplementation(() => {
            attempts += 1;
            return Promise.resolve(attempts < 3 ? undefined : { value: serialized });
        });

        const pending = requestSettings();
        await vi.runAllTimersAsync();

        expect((await pending)?.notificationsDurationMs).toBe(4321);
        expect(attempts).toBe(3);
    });

    it("fails without retrying when the stored settings cannot be read", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ value: "{not json" });

        await expect(requestSettings()).rejects.toThrow();
        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("gives up after three attempts and resolves null", async () => {
        (chrome.runtime.sendMessage as any).mockRejectedValue(new Error("Could not establish connection."));

        const pending = requestSettings();
        await vi.runAllTimersAsync();

        await expect(pending).resolves.toBeNull();
        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
    });
});
