import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SetLabelView from "../../src/popup/app/SetLabelView";
import { serializeSettings } from "../../src/settings/serializer";
import { getDefaultSettings } from "../../src/settings/settings-defaults";
import { makeWebUISettings } from "../helpers/fixtures";

const infoHash = "0123456789abcdef0123456789abcdef01234567";

function respond(setLabelReply: unknown = { value: undefined }) {
    const settings = getDefaultSettings();
    settings.webuiSettings = [makeWebUISettings({ id: "w1", name: "Seedbox", labels: ["movies", "tv"] })];
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === "getSettings") {
            return Promise.resolve({ value: serializeSettings(settings) });
        }
        if (message.action === "setTorrentLabel") {
            return Promise.resolve(setLabelReply);
        }
        return Promise.resolve({ value: undefined });
    });
}

function openAt(query: string) {
    window.history.pushState({}, "", `/popup/popup.html?${query}`);
}

beforeEach(() => {
    vi.spyOn(window, "close").mockImplementation(() => undefined);
    openAt(`mode=label&webUiId=w1&infoHash=${infoHash}&torrentName=Cool+Torrent`);
});

afterEach(() => {
    window.history.pushState({}, "", "/");
});

describe("SetLabelView", () => {
    it("shows the torrent and preselects the most recently used label", async () => {
        respond();
        render(<SetLabelView />);

        expect(await screen.findByText("Cool Torrent in Seedbox")).toBeInTheDocument();
        expect(screen.getByLabelText("Label")).toHaveValue("movies");
    });

    it("sends the chosen label with the reordered label list, then closes", async () => {
        respond();
        render(<SetLabelView />);
        const input = await screen.findByLabelText("Label");

        await userEvent.clear(input);
        await userEvent.type(input, "tv");
        await userEvent.tab();
        await userEvent.click(screen.getByRole("button", { name: "Set label" }));

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: "setTorrentLabel",
            webUiId: "w1",
            infoHash,
            torrentName: "Cool Torrent",
            label: "tv",
            labels: ["tv", "movies"],
        });
        expect(window.close).toHaveBeenCalled();
    });

    it("submits with enter", async () => {
        respond();
        render(<SetLabelView />);
        const input = await screen.findByLabelText("Label");

        await userEvent.type(input, "{Enter}");

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ action: "setTorrentLabel", label: "movies" }),
        );
    });

    it("stays open and shows the error when the client refuses", async () => {
        respond({ error: "Setting the label failed (HTTP 409): nope" });
        render(<SetLabelView />);
        await screen.findByLabelText("Label");

        await userEvent.click(screen.getByRole("button", { name: "Set label" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Setting the label failed (HTTP 409): nope");
        expect(window.close).not.toHaveBeenCalled();
    });

    it("explains when the WebUI is gone", async () => {
        openAt(`mode=label&webUiId=deleted&infoHash=${infoHash}`);
        respond();
        render(<SetLabelView />);

        expect(await screen.findByText("Nothing to label")).toBeInTheDocument();
    });

    it("explains when the link carries no torrent", async () => {
        openAt("mode=label");
        render(<SetLabelView />);

        expect(screen.getByText("Nothing to label")).toBeInTheDocument();
    });
});
