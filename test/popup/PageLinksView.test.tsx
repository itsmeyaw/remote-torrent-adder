import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PageLinksView from "../../src/popup/app/PageLinksView";

beforeEach(() => {
    vi.spyOn(window, "close").mockImplementation(() => undefined);
    (chrome.tabs.query as any).mockResolvedValue([{ id: 42, url: "https://tracker.org/browse" }]);
});

describe("PageLinksView", () => {
    it("lists the links the content script found", async () => {
        (chrome.tabs.sendMessage as any).mockResolvedValue({
            value: {
                links: [
                    { url: "https://example.com/a.torrent", label: "Ubuntu ISO" },
                    { url: "magnet:?xt=urn:btih:abc", label: "Debian" },
                ],
            },
        });

        render(<PageLinksView />);

        expect(await screen.findByText("Ubuntu ISO")).toBeInTheDocument();
        expect(screen.getByText("Debian")).toBeInTheDocument();
        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { action: "getPageLinks" }, { frameId: 0 });
    });

    it("says so when no links are found", async () => {
        (chrome.tabs.sendMessage as any).mockResolvedValue({ value: { links: [] } });

        render(<PageLinksView />);

        expect(await screen.findByText("No links found")).toBeInTheDocument();
    });

    it("shows an error notice when the content script can't be reached", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        (chrome.tabs.sendMessage as any).mockRejectedValue(new Error("Could not establish connection."));

        render(<PageLinksView />);

        expect(await screen.findByText("Could not scan this page")).toBeInTheDocument();
    });

    it("adding a link fires the same message a real page click would, then closes", async () => {
        (chrome.tabs.sendMessage as any).mockResolvedValue({
            value: { links: [{ url: "https://example.com/a.torrent", label: "Ubuntu ISO" }] },
        });

        render(<PageLinksView />);
        await userEvent.click(await screen.findByText("Ubuntu ISO"));

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: "preAddTorrent",
            url: "https://example.com/a.torrent",
            tabId: 42,
            frameId: 0,
            pageUrl: "https://tracker.org/browse",
        });
        expect(window.close).toHaveBeenCalled();
    });
});
