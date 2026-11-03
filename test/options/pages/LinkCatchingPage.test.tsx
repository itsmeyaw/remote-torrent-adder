import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsProvider } from "../../../src/options/SettingsContext";
import LinkCatchingPage from "../../../src/options/pages/LinkCatchingPage";
import { GetSettingsMessage, SaveSettingsMessage } from "../../../src/models/messages";
import { serializeSettings, deserializeSettings } from "../../../src/settings/serializer";
import { getDefaultSettings } from "../../../src/settings/settings-defaults";

function respondWithSettings(settings = getDefaultSettings()) {
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === GetSettingsMessage.action) {
            return Promise.resolve(serializeSettings(settings));
        }
        return Promise.resolve();
    });
}

function savedRegexSources(): string[] | undefined {
    const save = (chrome.runtime.sendMessage as any).mock.calls
        .map((call: any[]) => call[0])
        .filter((message: any) => message?.action === SaveSettingsMessage.action)
        .at(-1);
    return save && deserializeSettings(save.settings)!.linkCatchingRegexes.map((r: RegExp) => r.source);
}

function settingsWith(regexes: RegExp[]) {
    const settings = getDefaultSettings();
    settings.linkCatchingRegexes = regexes;
    return settings;
}

const renderPage = () => render(<SettingsProvider><LinkCatchingPage /></SettingsProvider>);

describe("LinkCatchingPage", () => {
    it("adds a valid pattern", async () => {
        respondWithSettings(settingsWith([]));
        renderPage();

        await userEvent.type(await screen.findByPlaceholderText("Add new regex"), "\\.torrent$");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));

        expect(savedRegexSources()).toEqual(["\\.torrent$"]);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("rejects an empty pattern on add with an inline error", async () => {
        respondWithSettings(settingsWith([]));
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Add" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/cannot be empty/);
        expect(savedRegexSources()).toBeUndefined();
    });

    it("rejects a whitespace-only pattern on add", async () => {
        respondWithSettings(settingsWith([]));
        renderPage();

        await userEvent.type(await screen.findByPlaceholderText("Add new regex"), "   ");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/cannot be empty/);
        expect(savedRegexSources()).toBeUndefined();
    });

    it("rejects an invalid regex on add with an inline error", async () => {
        respondWithSettings(settingsWith([]));
        renderPage();

        await userEvent.type(await screen.findByPlaceholderText("Add new regex"), "(");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/Not a valid regular expression/);
        expect(savedRegexSources()).toBeUndefined();
    });

    it("keeps the edit field open and shows an error when saving an empty pattern", async () => {
        respondWithSettings(settingsWith([new RegExp("\\.torrent$")]));
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "✎" }));
        const input = screen.getByDisplayValue("\\.torrent$");
        await userEvent.clear(input);
        await userEvent.click(screen.getByRole("button", { name: "✔" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/cannot be empty/);
        expect(input).toHaveValue("");
        expect(savedRegexSources()).toBeUndefined();
    });

    it("saves a valid edit", async () => {
        respondWithSettings(settingsWith([new RegExp("\\.torrent$")]));
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "✎" }));
        const input = screen.getByDisplayValue("\\.torrent$");
        await userEvent.clear(input);
        await userEvent.type(input, "\\.zip$");
        await userEvent.click(screen.getByRole("button", { name: "✔" }));

        expect(savedRegexSources()).toEqual(["\\.zip$"]);
        expect(screen.queryByRole("alert")).toBeNull();
    });
});
