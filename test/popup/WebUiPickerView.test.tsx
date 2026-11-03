import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WebUiPickerView from "../../src/popup/app/WebUiPickerView";
import { serializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { makeWebUISettings } from "../helpers/fixtures";

function respondWithSettings(settings = getDefaultSettings()) {
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === "getSettings") {
            return Promise.resolve({ value: serializeSettings(settings) });
        }
        return Promise.resolve({ value: undefined });
    });
}

beforeEach(() => {
    vi.spyOn(window, "close").mockImplementation(() => undefined);
});

describe("WebUiPickerView", () => {
    it("lists every configured WebUI", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [
            makeWebUISettings({ id: "a", name: "Home qBittorrent", host: "h1", port: 8080 }),
            makeWebUISettings({ id: "b", name: "Seedbox", host: "h2", port: 9091 }),
        ];
        respondWithSettings(settings);

        render(<WebUiPickerView />);

        expect(await screen.findByText("Home qBittorrent")).toBeInTheDocument();
        expect(screen.getByText("Seedbox")).toBeInTheDocument();
    });

    it("says so when no WebUI is configured", async () => {
        respondWithSettings();
        render(<WebUiPickerView />);

        expect(await screen.findByText("No WebUIs configured")).toBeInTheDocument();
    });

    it("asks the service worker to open the chosen WebUI and closes the popup", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "a", name: "Home qBittorrent", host: "h1", port: 8080 })];
        respondWithSettings(settings);

        render(<WebUiPickerView />);
        await userEvent.click(await screen.findByText("Home qBittorrent"));

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: "openWebUi", webUiId: "a" });
        await vi.waitFor(() => expect(window.close).toHaveBeenCalled());
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
});
