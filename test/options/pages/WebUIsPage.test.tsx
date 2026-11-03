import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsProvider } from "../../../src/options/SettingsContext";
import WebUIsPage, { moveItem, parsePortInput } from "../../../src/options/pages/WebUIsPage";
import { serializeSettings, deserializeSettings } from "../../../src/settings/serializer";
import { getDefaultSettings } from "../../../src/settings/settings-defaults";
import { type ConnectionTestResult } from "../../../src/models/webui";
import { makeWebUISettings } from "../../helpers/fixtures";

function respondWithWebUIs(
    webuiSettings = [makeWebUISettings({ id: "a", name: "Alpha" }), makeWebUISettings({ id: "b", name: "Beta" })],
    connectionTest?: ConnectionTestResult | { error: string },
) {
    const settings = getDefaultSettings();
    settings.webuiSettings = webuiSettings;
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === "getSettings") {
            return Promise.resolve({ value: serializeSettings(settings) });
        }
        if (message.action === "testConnection" && connectionTest) {
            return Promise.resolve("error" in connectionTest ? connectionTest : { value: connectionTest });
        }
        return Promise.resolve({ value: undefined });
    });
}

const savedWebUIs = () => {
    const save = (chrome.runtime.sendMessage as any).mock.calls
        .map((call: any[]) => call[0])
        .findLast((message: any) => message?.action === "saveSettings");
    return save ? deserializeSettings(save.settings)!.webuiSettings : null;
};

const renderPage = () => render(<SettingsProvider><WebUIsPage /></SettingsProvider>);

describe("WebUIsPage", () => {
    it("removes the selected WebUI once the removal is confirmed", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
        await userEvent.click(screen.getByRole("button", { name: "For real?" }));

        expect(savedWebUIs()!.map(w => w.id)).toEqual(["b"]);
    });

    it("keeps the selected WebUI when the removal is cancelled", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
        expect(savedWebUIs()).toBeNull();
    });

    it("disarms a pending removal confirmation when another WebUI is selected", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
        expect(screen.getByRole("button", { name: "For real?" })).toBeInTheDocument();

        await userEvent.click(screen.getByText("Beta"));

        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "For real?" })).not.toBeInTheDocument();
    });

    it("re-arms the confirmation independently after switching back", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
        await userEvent.click(screen.getByText("Beta"));
        await userEvent.click(screen.getByText("Alpha"));

        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
        expect(savedWebUIs()).toBeNull();
    });

    it("stores no port at all when the port field is cleared", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha", port: 8080 })]);
        renderPage();

        await userEvent.clear(await screen.findByLabelText("Port"));

        expect(savedWebUIs()![0]!.port).toBeNull();
        expect(screen.getByLabelText("Port")).toHaveValue(null);
    });

    it("clamps a port above the maximum instead of storing it", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha", port: 8080 })]);
        renderPage();

        const port = await screen.findByLabelText("Port");
        await userEvent.clear(port);
        await userEvent.type(port, "99999");

        expect(savedWebUIs()![0]!.port).toBe(65535);
    });

    it("refuses a negative port", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha", port: 8080 })]);
        renderPage();

        const port = await screen.findByLabelText("Port");
        await userEvent.clear(port);
        await userEvent.type(port, "-1");

        expect(savedWebUIs()![0]!.port).toBe(1);
    });

    it("renders the empty state for a WebUI with no Auto Label/Dir rules", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha", autoLabelDirSettings: [] })]);
        renderPage();

        expect(await screen.findByText("Auto Label/Dir Settings")).toBeInTheDocument();
        expect(screen.getByText("No rules defined yet.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    it("adds the first Auto Label/Dir rule to a WebUI that has none", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha", autoLabelDirSettings: [] })]);
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Add Rule" }));

        expect(screen.queryByText("No rules defined yet.")).not.toBeInTheDocument();
        expect(savedWebUIs()![0]!.autoLabelDirSettings).toEqual([{ criteria: [], label: "", dir: "" }]);
    });

    it("renders the stored rules, including torrent name criteria", async () => {
        respondWithWebUIs([makeWebUISettings({
            id: "a",
            name: "Alpha",
            autoLabelDirSettings: [{ criteria: [{ field: "torrentName", value: "2160p" }], label: "uhd", dir: null }],
        })]);
        renderPage();

        expect(await screen.findByText("Auto Label/Dir Settings")).toBeInTheDocument();
        expect(screen.queryByText("No rules defined yet.")).not.toBeInTheDocument();
        expect(screen.getByText("Torrent name:")).toBeInTheDocument();
        expect(screen.getByText("2160p")).toBeInTheDocument();
    });

    it("groups the connection settings and toggles under General", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })]);
        renderPage();

        const general = await screen.findByRole("region", { name: "General" });
        expect(within(general).getByLabelText("Port")).toBeInTheDocument();
        expect(within(general).getByRole("button", { name: "Test connection" })).toBeInTheDocument();
        expect(within(general).getByText("Add torrents paused")).toBeInTheDocument();
        expect(within(general).getByText("Show per-torrent config selector")).toBeInTheDocument();
    });

    it("groups the default label and directory with their per-torrent choices", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })]);
        renderPage();

        const labelsAndDirs = await screen.findByRole("region", { name: "Labels & Directories" });
        expect(within(labelsAndDirs).getByText("Default Label")).toBeInTheDocument();
        expect(within(labelsAndDirs).getByText("Labels for per-torrent selection")).toBeInTheDocument();
        expect(within(labelsAndDirs).getByText("Default Directory")).toBeInTheDocument();
        expect(within(labelsAndDirs).getByText("Directories for per-torrent selection")).toBeInTheDocument();
    });

    it("shows a warning when the connection is reachable but not verified", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })], {
            reachable: true, authenticated: null, httpResponseCode: 500, message: "Reachable, but the server answered HTTP 500; credentials could not be verified",
        });
        renderPage();

        const general = await screen.findByRole("region", { name: "General" });
        await userEvent.click(within(general).getByRole("button", { name: "Test connection" }));

        expect(await within(general).findByText(/^⚠ Reachable, but the server answered HTTP 500/)).toBeInTheDocument();
    });

    it("shows the background's error message when the connection test fails", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })], { error: "Failed updating CORS rules" });
        renderPage();

        const general = await screen.findByRole("region", { name: "General" });
        await userEvent.click(within(general).getByRole("button", { name: "Test connection" }));

        expect(await within(general).findByText("❌ Failed updating CORS rules")).toBeInTheDocument();
    });

    it("shows a check mark when the connection is authenticated", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })], {
            reachable: true, authenticated: true, httpResponseCode: 200, message: "Reachable & authenticated",
        });
        renderPage();

        const general = await screen.findByRole("region", { name: "General" });
        await userEvent.click(within(general).getByRole("button", { name: "Test connection" }));

        expect(await within(general).findByText("✅ Reachable & authenticated")).toBeInTheDocument();
    });
});

describe("moveItem", () => {
    it("moves an item down", () => {
        expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    });

    it("moves an item up", () => {
        expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    });

    it("swaps neighbours", () => {
        expect(moveItem(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
    });

    it("does not mutate the input", () => {
        const items = ["a", "b", "c"];
        moveItem(items, 0, 2);
        expect(items).toEqual(["a", "b", "c"]);
    });

    it("returns the same array reference for a no-op move", () => {
        const items = ["a", "b", "c"];
        expect(moveItem(items, 1, 1)).toBe(items);
    });

    it("returns the same array reference for out-of-range indices", () => {
        const items = ["a", "b", "c"];
        expect(moveItem(items, -1, 1)).toBe(items);
        expect(moveItem(items, 0, 3)).toBe(items);
        expect(moveItem(items, 3, 0)).toBe(items);
    });
});

describe("parsePortInput", () => {
    it("returns null for an empty field", () => {
        expect(parsePortInput("")).toBeNull();
    });

    it("parses a plain port number", () => {
        expect(parsePortInput("8080")).toBe(8080);
    });

    it("drops a leading minus so negative ports cannot be entered", () => {
        expect(parsePortInput("-8080")).toBe(8080);
        expect(parsePortInput("-")).toBeNull();
    });

    it("clamps anything above the maximum port", () => {
        expect(parsePortInput("65536")).toBe(65535);
        expect(parsePortInput("999999")).toBe(65535);
    });

    it("treats zero and leading zeroes as no port", () => {
        expect(parsePortInput("0")).toBeNull();
        expect(parsePortInput("00080")).toBe(80);
    });

    it("ignores non-digit characters", () => {
        expect(parsePortInput("8e4")).toBe(84);
        expect(parsePortInput("abc")).toBeNull();
    });
});
