import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const platform = vi.hoisted(() => ({ firefox: false }));
vi.mock("../../../src/util/platform", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    isFirefox: () => platform.firefox,
}));

import { SettingsProvider } from "../../../src/options/SettingsContext";
import NotificationsPage from "../../../src/options/pages/NotificationsPage";
import { serializeSettings, deserializeSettings } from "../../../src/settings/serializer";
import { getDefaultSettings } from "../../../src/settings/settings-defaults";

const BUTTON_TOGGLE = /Offer an "Add label" button after adding/;

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
            <NotificationsPage />
        </SettingsProvider>,
    );

beforeEach(() => {
    platform.firefox = false;
});

describe("NotificationsPage add-label button toggle", () => {
    it("is on by default", async () => {
        respondWithSettings();
        renderPage();

        expect(await screen.findByRole("checkbox", { name: BUTTON_TOGGLE })).toBeChecked();
    });

    it("persists turning it off", async () => {
        respondWithSettings();
        renderPage();

        await userEvent.click(await screen.findByRole("checkbox", { name: BUTTON_TOGGLE }));

        const save = (chrome.runtime.sendMessage as any).mock.calls
            .map((call: any[]) => call[0])
            .find((message: any) => message?.action === "saveSettings");
        expect(deserializeSettings(save.settings)!.notificationsLabelButtonEnabled).toBe(false);
    });

    it("is hidden on firefox, where notifications cannot carry buttons", async () => {
        platform.firefox = true;
        respondWithSettings();
        renderPage();

        expect(await screen.findByRole("checkbox", { name: /Play a sound/ })).toBeInTheDocument();
        expect(screen.queryByRole("checkbox", { name: BUTTON_TOGGLE })).not.toBeInTheDocument();
    });
});

describe("NotificationsPage test buttons", () => {
    it.each([
        ["Test Success Notification", false],
        ["Test Failed Notification", true],
    ])("%s sends only the outcome for the background to build the notification", async (buttonName, isFailed) => {
        respondWithSettings();
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: buttonName }));

        const sent = (chrome.runtime.sendMessage as any).mock.calls
            .map((call: any[]) => call[0])
            .find((message: any) => message?.action === "testNotification");
        expect(sent).toEqual({ action: "testNotification", isFailed });
    });
});
