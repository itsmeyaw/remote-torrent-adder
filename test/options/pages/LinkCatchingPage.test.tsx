import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsProvider } from "../../../src/options/SettingsContext";
import LinkCatchingPage from "../../../src/options/pages/LinkCatchingPage";
import { serializeSettings, deserializeSettings } from "../../../src/settings/serializer";
import { getDefaultSettings } from "../../../src/settings/settings-defaults";

function respondWithSettings(settings = getDefaultSettings()) {
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === "getSettings") {
            return Promise.resolve({ value: serializeSettings(settings) });
        }
        return Promise.resolve({ value: undefined });
    });
}

function savedRegexSources(): string[] | undefined {
    const save = (chrome.runtime.sendMessage as any).mock.calls
        .map((call: any[]) => call[0])
        .filter((message: any) => message?.action === "saveSettings")
        .at(-1);
    return save && deserializeSettings(save.settings)!.linkCatchingRegexes.map((r: RegExp) => r.source);
}

function settingsWith(regexes: RegExp[]) {
    const settings = getDefaultSettings();
    settings.linkCatchingRegexes = regexes;
    return settings;
}

const renderPage = () =>
    render(
        <SettingsProvider>
            <LinkCatchingPage />
        </SettingsProvider>,
    );

describe("LinkCatchingPage", () => {
    it("adds a valid pattern", async () => {
        respondWithSettings(settingsWith([]));
        renderPage();

        await userEvent.type(await screen.findByPlaceholderText("Add new regex"), "\\.torrent$");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));

        expect(savedRegexSources()).toEqual(["\\.torrent$"]);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("adds a pattern when Enter is pressed in the add field", async () => {
        respondWithSettings(settingsWith([]));
        renderPage();

        await userEvent.type(await screen.findByPlaceholderText("Add new regex"), "\\.zip${Enter}");

        expect(savedRegexSources()).toEqual(["\\.zip$"]);
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

        await userEvent.click(await screen.findByRole("button", { name: "Edit pattern \\.torrent$" }));
        const input = screen.getByDisplayValue("\\.torrent$");
        await userEvent.clear(input);
        await userEvent.click(screen.getByRole("button", { name: "Save pattern" }));

        expect(screen.getByRole("alert")).toHaveTextContent(/cannot be empty/);
        expect(input).toHaveValue("");
        expect(savedRegexSources()).toBeUndefined();
    });

    it("saves a valid edit", async () => {
        respondWithSettings(settingsWith([new RegExp("\\.torrent$")]));
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Edit pattern \\.torrent$" }));
        const input = screen.getByDisplayValue("\\.torrent$");
        await userEvent.clear(input);
        await userEvent.type(input, "\\.zip$");
        await userEvent.click(screen.getByRole("button", { name: "Save pattern" }));

        expect(savedRegexSources()).toEqual(["\\.zip$"]);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("saves an edit when Enter is pressed", async () => {
        respondWithSettings(settingsWith([new RegExp("\\.torrent$")]));
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Edit pattern \\.torrent$" }));
        const input = screen.getByDisplayValue("\\.torrent$");
        await userEvent.clear(input);
        await userEvent.type(input, "\\.zip${Enter}");

        expect(savedRegexSources()).toEqual(["\\.zip$"]);
    });

    it("cancels an edit when Escape is pressed and keeps the pattern", async () => {
        respondWithSettings(settingsWith([new RegExp("\\.torrent$")]));
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Edit pattern \\.torrent$" }));
        await userEvent.type(screen.getByDisplayValue("\\.torrent$"), "x{Escape}");

        expect(screen.queryByDisplayValue(/\\\.torrent/)).toBeNull();
        expect(screen.getByText("\\.torrent$")).toBeInTheDocument();
        expect(savedRegexSources()).toBeUndefined();
    });

    it("keeps editing the same pattern when an earlier pattern is removed", async () => {
        respondWithSettings(settingsWith([new RegExp("alpha"), new RegExp("beta"), new RegExp("gamma")]));
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Edit pattern beta" }));
        await userEvent.click(screen.getByRole("button", { name: "Remove pattern alpha" }));
        const input = screen.getByDisplayValue("beta");
        await userEvent.clear(input);
        await userEvent.type(input, "beta2");
        await userEvent.click(screen.getByRole("button", { name: "Save pattern" }));

        expect(savedRegexSources()).toEqual(["beta2", "gamma"]);
    });
});

describe("LinkCatchingPage dependent controls", () => {
    it("disables the pattern and test inputs while link catching is off", async () => {
        const settings = getDefaultSettings();
        settings.linkCatchingEnabled = false;
        respondWithSettings(settings);
        renderPage();

        expect(await screen.findByRole("textbox", { name: "New pattern" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
        expect(screen.getByRole("textbox", { name: "Link to test" })).toBeDisabled();
    });

    it("enables the pattern and test inputs while link catching is on", async () => {
        respondWithSettings(getDefaultSettings());
        renderPage();

        expect(await screen.findByRole("textbox", { name: "New pattern" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
        expect(screen.getByRole("textbox", { name: "Link to test" })).toBeEnabled();
    });
});
