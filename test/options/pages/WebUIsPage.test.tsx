import { describe, it, expect } from "vite-plus/test";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const renderPage = () =>
    render(
        <SettingsProvider>
            <WebUIsPage />
        </SettingsProvider>,
    );

describe("WebUIsPage", () => {
    it("removes the selected WebUI once the removal is confirmed", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
        const dialog = await screen.findByRole("alertdialog");
        expect(within(dialog).getByText("Remove Alpha?")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove WebUI" }));

        expect(savedWebUIs()!.map((w) => w.id)).toEqual(["b"]);
    });

    it("saves nothing until the removal is confirmed", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Remove" }));

        expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
        expect(savedWebUIs()).toBeNull();
    });

    it("keeps the selected WebUI when the removal is cancelled", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
        await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));

        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
        expect(savedWebUIs()).toBeNull();
    });

    it("edits the name from the Name field in the detail header", async () => {
        respondWithWebUIs();
        renderPage();

        const name = await screen.findByRole("textbox", { name: "Name" });
        await userEvent.clear(name);
        await userEvent.type(name, "Gamma");

        expect(savedWebUIs()![0]!.name).toBe("Gamma");
    });

    it("moves a WebUI down with the arrow keys on its reorder handle", async () => {
        respondWithWebUIs();
        renderPage();

        const handle = await screen.findByRole("button", { name: "Reorder Alpha" });
        handle.focus();
        await userEvent.keyboard("{ArrowDown}");

        expect(savedWebUIs()!.map((w) => w.id)).toEqual(["b", "a"]);
        expect(screen.getByRole("button", { name: "Reorder Alpha" })).toHaveFocus();
    });

    it("makes the selected WebUI primary and shows the badge on the first one only", async () => {
        respondWithWebUIs();
        renderPage();

        await userEvent.click(await screen.findByText("Beta"));
        await userEvent.click(screen.getByRole("button", { name: "Make primary" }));

        expect(savedWebUIs()!.map((w) => w.id)).toEqual(["b", "a"]);
    });

    it("shows the Primary badge on the first WebUI only", async () => {
        respondWithWebUIs();
        renderPage();

        await screen.findByText("Alpha");
        expect(screen.getAllByText("Primary")).toHaveLength(1);
    });

    it("shows only the client choice and a hint while no client is chosen", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha", client: "" as never })]);
        renderPage();

        expect(await screen.findByText("Choose a client to configure this WebUI.")).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Client" })).toBeInTheDocument();
        expect(screen.queryByRole("textbox", { name: "Host" })).not.toBeInTheDocument();
    });

    it("saves the chosen client and locks the client selector", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha", client: "" as never })]);
        renderPage();

        await userEvent.click(await screen.findByRole("combobox", { name: "Client" }));
        await userEvent.click(await screen.findByRole("option", { name: "Deluge" }));

        expect(savedWebUIs()![0]!.client).toBe("deluge");
        expect(screen.queryByRole("combobox", { name: "Client" })).not.toBeInTheDocument();
        expect(screen.getByText(/can't be changed once chosen/)).toBeInTheDocument();
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
        respondWithWebUIs([
            makeWebUISettings({
                id: "a",
                name: "Alpha",
                autoLabelDirSettings: [
                    { criteria: [{ field: "torrentName", value: "2160p" }], label: "uhd", dir: null },
                ],
            }),
        ]);
        renderPage();

        expect(await screen.findByText("Auto Label/Dir Settings")).toBeInTheDocument();
        expect(screen.queryByText("No rules defined yet.")).not.toBeInTheDocument();
        expect(screen.getByText("Torrent name:")).toBeInTheDocument();
        expect(screen.getByText("2160p")).toBeInTheDocument();
    });

    it("groups the connection settings under Connection", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })]);
        renderPage();

        const connection = await screen.findByRole("region", { name: "Connection" });
        expect(within(connection).getByLabelText("Port")).toBeInTheDocument();
        expect(within(connection).getByRole("button", { name: "Test connection" })).toBeInTheDocument();
    });

    it("groups the torrent adding toggles under Adding torrents", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })]);
        renderPage();

        const adding = await screen.findByRole("region", { name: "Adding torrents" });
        expect(within(adding).getByRole("switch", { name: "Add torrents paused" })).toBeInTheDocument();
        expect(within(adding).getByRole("switch", { name: "Show per-torrent config selector" })).toBeInTheDocument();
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
            reachable: true,
            authenticated: null,
            httpResponseCode: 500,
            message: "Reachable, but the server answered HTTP 500; credentials could not be verified",
        });
        renderPage();

        const connection = await screen.findByRole("region", { name: "Connection" });
        await userEvent.click(within(connection).getByRole("button", { name: "Test connection" }));

        await waitFor(() =>
            expect(within(connection).getByRole("status")).toHaveTextContent(
                "Reachable, but the server answered HTTP 500; credentials could not be verified",
            ),
        );
    });

    it("shows the background's error message when the connection test fails", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })], { error: "Failed updating CORS rules" });
        renderPage();

        const connection = await screen.findByRole("region", { name: "Connection" });
        await userEvent.click(within(connection).getByRole("button", { name: "Test connection" }));

        await waitFor(() =>
            expect(within(connection).getByRole("status")).toHaveTextContent("Failed updating CORS rules"),
        );
    });

    it("shows the success message when the connection is authenticated", async () => {
        respondWithWebUIs([makeWebUISettings({ id: "a", name: "Alpha" })], {
            reachable: true,
            authenticated: true,
            httpResponseCode: 200,
            message: "Reachable & authenticated",
        });
        renderPage();

        const connection = await screen.findByRole("region", { name: "Connection" });
        await userEvent.click(within(connection).getByRole("button", { name: "Test connection" }));

        await waitFor(() =>
            expect(within(connection).getByRole("status")).toHaveTextContent("Reachable & authenticated"),
        );
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
