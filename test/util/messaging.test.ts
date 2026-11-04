import { describe, it, expect, vi } from "vitest";
import { listenForMessages, sendMessage, sendMessageAndForget, sendMessageToTab } from "../../src/util/messaging";

/** Registers a listener with a few handlers and returns the function the runtime would call. */
function registeredListener() {
    listenForMessages({
        getSettings: () => "{}",
        saveSettings: () => {
            throw new Error("Invalid notificationsDurationMs");
        },
    });
    return (chrome.runtime.onMessage.addListener as any).mock.calls.at(-1)[0];
}

describe("sendMessage", () => {
    it("resolves with the value of the reply", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ value: "{}" });

        await expect(sendMessage("getSettings", {})).resolves.toBe("{}");
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "getSettings" });
    });

    it("sends the request fields next to the action", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ value: undefined });

        await sendMessage("saveSettings", { settings: "{}" });

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "saveSettings", settings: "{}" });
    });

    it("throws the message of an error reply", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({ error: "Invalid notificationsDurationMs" });

        await expect(sendMessage("saveSettings", { settings: "{}" })).rejects.toThrow(
            "Invalid notificationsDurationMs",
        );
    });

    it("resolves undefined for a void reply", async () => {
        (chrome.runtime.sendMessage as any).mockResolvedValue({});

        await expect(sendMessage("saveSettings", { settings: "{}" })).resolves.toBeUndefined();
    });

    it.each([undefined, null, "hello"])("throws when the reply is %j instead of an envelope", async (reply) => {
        (chrome.runtime.sendMessage as any).mockResolvedValue(reply);

        await expect(sendMessage("getSettings", {})).rejects.toThrow("No reply to getSettings");
    });

    it("sends to a tab and resolves with the reply value", async () => {
        (chrome.tabs.sendMessage as any).mockResolvedValue({ value: { links: [] } });

        await expect(sendMessageToTab(42, "getPageLinks", {}, { frameId: 0 })).resolves.toEqual({ links: [] });
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { action: "getPageLinks" }, { frameId: 0 });
    });

    it("throws the message of an error reply from a tab", async () => {
        (chrome.tabs.sendMessage as any).mockResolvedValue({ error: "Failed to fetch" });

        await expect(sendMessageToTab(42, "getPageLinks", {})).rejects.toThrow("Failed to fetch");
    });
});

describe("sendMessageAndForget", () => {
    it("does not surface a failed send", async () => {
        (chrome.runtime.sendMessage as any).mockRejectedValue(new Error("Could not establish connection."));

        sendMessageAndForget("updateActionBadgeText", { text: "" });

        await vi.waitFor(() =>
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "updateActionBadgeText", text: "" }),
        );
    });
});

describe("listenForMessages", () => {
    it("replies to a handled message with its value", async () => {
        const sendResponse = vi.fn();

        expect(registeredListener()({ action: "getSettings" }, {}, sendResponse)).toBe(true);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ value: "{}" }));
    });

    it("replies with the message of a handler that throws", async () => {
        const sendResponse = vi.fn();
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(registeredListener()({ action: "saveSettings", settings: "{}" }, {}, sendResponse)).toBe(true);

        await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ error: "Invalid notificationsDurationMs" }));
    });

    it("leaves a message without a handler to another context: no reply", () => {
        const sendResponse = vi.fn();

        expect(registeredListener()({ action: "playSound", isFailed: true }, {}, sendResponse)).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });
});
