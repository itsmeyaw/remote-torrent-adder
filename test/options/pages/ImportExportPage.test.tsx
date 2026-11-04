import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsProvider } from "../../../src/options/SettingsContext";
import ImportExportPage from "../../../src/options/pages/ImportExportPage";
import { serializeSettings, deserializeSettings } from "../../../src/settings/serializer";
import { getDefaultSettings } from "../../../src/settings/settings-defaults";
import { makeWebUISettings } from "../../helpers/fixtures";
import { type WebUISettings } from "../../../src/models/webui";

function respondWithSettings() {
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === "getSettings") {
            return Promise.resolve({ value: serializeSettings(getDefaultSettings()) });
        }
        return Promise.resolve({ value: undefined });
    });
}

function savedWebUiNames(): string[] | undefined {
    const save = (chrome.runtime.sendMessage as any).mock.calls
        .map((call: any[]) => call[0])
        .filter((message: any) => message?.action === "saveSettings")
        .at(-1);
    return save && deserializeSettings(save.settings)!.webuiSettings.map((webUi) => webUi.name);
}

function exportWithWebUis(webUis: unknown[]): string {
    const settings = getDefaultSettings();
    settings.webuiSettings = webUis as WebUISettings[];
    return serializeSettings(settings);
}

const renderPage = () =>
    render(
        <SettingsProvider>
            <ImportExportPage />
        </SettingsProvider>,
    );

async function importText(text: string) {
    fireEvent.change(await screen.findByLabelText("Settings to import", { selector: "textarea" }), {
        target: { value: text },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import settings" }));
}

describe("ImportExportPage export", () => {
    const writeText = vi.fn();

    beforeEach(() => {
        writeText.mockReset();
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    });

    afterEach(() => {
        Reflect.deleteProperty(navigator, "clipboard");
    });

    it("warns that the export contains passwords in plain text", async () => {
        respondWithSettings();
        renderPage();

        expect(await screen.findByText(/passwords in plain text/i)).toBeInTheDocument();
    });

    it("announces the password warning as a note and links it to the export text", async () => {
        respondWithSettings();
        renderPage();

        expect(await screen.findByRole("note")).toHaveTextContent(/passwords in plain text/i);
        expect(screen.getByLabelText("Exported settings")).toHaveAccessibleDescription(/passwords in plain text/i);
    });

    it("confirms a successful copy", async () => {
        respondWithSettings();
        writeText.mockResolvedValue(undefined);
        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Copy to clipboard" }));

        expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows an error and does not claim success when the copy fails", async () => {
        respondWithSettings();
        writeText.mockRejectedValue(new Error("denied"));
        renderPage();

        fireEvent.click(await screen.findByRole("button", { name: "Copy to clipboard" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy to the clipboard");
        expect(screen.queryByRole("button", { name: "Copied!" })).toBeNull();
    });
});

describe("ImportExportPage import", () => {
    it("imports a valid export and saves its WebUIs", async () => {
        respondWithSettings();
        renderPage();

        await importText(exportWithWebUis([makeWebUISettings({ id: "w1", name: "Home" })]));

        expect(savedWebUiNames()).toEqual(["Home"]);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("shows that text which is not JSON was rejected and saves nothing", async () => {
        respondWithSettings();
        renderPage();

        await importText("{not json");

        expect(screen.getByRole("alert")).toHaveTextContent("That is not valid JSON.");
        expect(savedWebUiNames()).toBeUndefined();
    });

    it("shows a problem with a top-level setting and saves nothing", async () => {
        respondWithSettings();
        renderPage();
        const settings = { ...getDefaultSettings(), notificationsDurationMs: -1 };

        await importText(serializeSettings(settings));

        expect(screen.getByRole("alert")).toHaveTextContent("Invalid notificationsDurationMs");
        expect(savedWebUiNames()).toBeUndefined();
    });

    it("lists every problem in a partially invalid import and saves nothing", async () => {
        respondWithSettings();
        renderPage();

        await importText(
            exportWithWebUis([
                makeWebUISettings({ id: "w1", name: "Good" }),
                { ...makeWebUISettings({ id: "w2", name: "Home" }), client: undefined },
            ]),
        );

        expect(screen.getByRole("alert")).toHaveTextContent('WebUI 2 ("Home"): missing client');
        expect(savedWebUiNames()).toBeUndefined();
    });
});
