import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsProvider } from "../../../src/options/SettingsContext";
import ImportExportPage from "../../../src/options/pages/ImportExportPage";
import { GetSettingsMessage, SaveSettingsMessage } from "../../../src/models/messages";
import { serializeSettings, deserializeSettings } from "../../../src/util/serializer";
import { getDefaultSettings } from "../../../src/util/settings-defaults";
import { makeWebUISettings } from "../../helpers/fixtures";
import { type WebUISettings } from "../../../src/models/webui";

function respondWithSettings() {
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === GetSettingsMessage.action) {
            return Promise.resolve(serializeSettings(getDefaultSettings()));
        }
        return Promise.resolve();
    });
}

function savedWebUiNames(): string[] | undefined {
    const save = (chrome.runtime.sendMessage as any).mock.calls
        .map((call: any[]) => call[0])
        .filter((message: any) => message?.action === SaveSettingsMessage.action)
        .at(-1);
    return save && deserializeSettings(save.settings)!.webuiSettings.map(webUi => webUi.name);
}

function exportWithWebUis(webUis: unknown[]): string {
    const settings = getDefaultSettings();
    settings.webuiSettings = webUis as WebUISettings[];
    return serializeSettings(settings);
}

const renderPage = () => render(<SettingsProvider><ImportExportPage /></SettingsProvider>);

async function importText(text: string) {
    fireEvent.change(await screen.findByLabelText(/Paste a previously exported/i, { selector: "textarea" }), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Import settings" }));
}

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

    it("lists every problem in a partially invalid import and saves nothing", async () => {
        respondWithSettings();
        renderPage();

        await importText(exportWithWebUis([
            makeWebUISettings({ id: "w1", name: "Good" }),
            { ...makeWebUISettings({ id: "w2", name: "Home" }), host: "" },
        ]));

        expect(screen.getByRole("alert")).toHaveTextContent('WebUI 2 ("Home"): missing host');
        expect(savedWebUiNames()).toBeUndefined();
    });
});
