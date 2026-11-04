import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsProvider } from "../../../src/options/SettingsContext";
import IconClickPage from "../../../src/options/pages/IconClickPage";
import { serializeSettings, deserializeSettings } from "../../../src/settings/serializer";
import { getDefaultSettings } from "../../../src/settings/settings-defaults";
import { makeWebUISettings } from "../../helpers/fixtures";

function respondWithSettings(settings = getDefaultSettings()) {
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === "getSettings") {
            return Promise.resolve({ value: serializeSettings(settings) });
        }
        return Promise.resolve({ value: undefined });
    });
}

const renderPage = () =>
    render(
        <SettingsProvider>
            <IconClickPage />
        </SettingsProvider>,
    );

describe("IconClickPage", () => {
    it("defaults to opening the primary WebUI", async () => {
        respondWithSettings();
        renderPage();

        expect(await screen.findByRole("radio", { name: /Open the primary WebUI/ })).toBeChecked();
    });

    it("disables the WebUI picker option when fewer than two WebUIs are configured", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings()];
        respondWithSettings(settings);
        renderPage();

        expect(await screen.findByRole("radio", { name: /Let me choose which WebUI to open/ })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
        expect(screen.getByText("Configure at least one more WebUI to enable this option.")).toBeInTheDocument();
    });

    it("enables the WebUI picker option when two or more WebUIs are configured", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "a" }), makeWebUISettings({ id: "b" })];
        respondWithSettings(settings);
        renderPage();

        expect(await screen.findByRole("radio", { name: /Let me choose which WebUI to open/ })).not.toHaveAttribute(
            "aria-disabled",
            "true",
        );
        expect(screen.queryByText("Configure at least one more WebUI to enable this option.")).toBeNull();
    });

    it("selects an option when its card text is clicked", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "a" }), makeWebUISettings({ id: "b" })];
        respondWithSettings(settings);
        renderPage();

        await userEvent.click(await screen.findByText("Show links found on this page"));

        expect(screen.getByRole("radio", { name: /Show links found on this page/ })).toBeChecked();
    });

    it("persists the chosen behavior", async () => {
        const settings = getDefaultSettings();
        settings.webuiSettings = [makeWebUISettings({ id: "a" }), makeWebUISettings({ id: "b" })];
        respondWithSettings(settings);
        renderPage();

        await userEvent.click(await screen.findByRole("radio", { name: /Show links found on this page/ }));

        const save = (chrome.runtime.sendMessage as any).mock.calls
            .map((call: any[]) => call[0])
            .find((message: any) => message?.action === "saveSettings");
        expect(deserializeSettings(save.settings)!.iconClickAction).toBe("showPageLinks");
    });
});
