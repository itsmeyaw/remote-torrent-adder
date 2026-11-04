import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
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

        expect(await screen.findByRole("switch", { name: BUTTON_TOGGLE })).toBeChecked();
    });

    it("persists turning it off", async () => {
        respondWithSettings();
        renderPage();

        await userEvent.click(await screen.findByRole("switch", { name: BUTTON_TOGGLE }));

        const save = (chrome.runtime.sendMessage as any).mock.calls
            .map((call: any[]) => call[0])
            .find((message: any) => message?.action === "saveSettings");
        expect(deserializeSettings(save.settings)!.notificationsLabelButtonEnabled).toBe(false);
    });

    it("is hidden on firefox, where notifications cannot carry buttons", async () => {
        platform.firefox = true;
        respondWithSettings();
        renderPage();

        expect(await screen.findByRole("switch", { name: /Play a sound/ })).toBeInTheDocument();
        expect(screen.queryByRole("switch", { name: BUTTON_TOGGLE })).not.toBeInTheDocument();
    });
});

describe("NotificationsPage test buttons", () => {
    it.each([
        ["Test success", false],
        ["Test failure", true],
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

describe("NotificationsPage dependent settings", () => {
    const settingsWith = (overrides: { notificationsEnabled: boolean; notificationsSoundEnabled: boolean }) => ({
        ...getDefaultSettings(),
        ...overrides,
    });

    it("disables the sound, label button and duration while notifications are off", async () => {
        respondWithSettings(settingsWith({ notificationsEnabled: false, notificationsSoundEnabled: true }));
        renderPage();

        expect(await screen.findByRole("switch", { name: /Play a sound/ })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("switch", { name: BUTTON_TOGGLE })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByLabelText("Display duration")).toBeDisabled();
    });

    it("keeps the test notification buttons enabled while notifications are off", async () => {
        respondWithSettings(settingsWith({ notificationsEnabled: false, notificationsSoundEnabled: true }));
        renderPage();

        expect(await screen.findByRole("button", { name: "Test success" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Test failure" })).toBeEnabled();
    });

    it("shows the custom sounds with their choose buttons disabled while sound is off", async () => {
        respondWithSettings(settingsWith({ notificationsEnabled: true, notificationsSoundEnabled: false }));
        renderPage();

        const choose = await screen.findAllByRole("button", { name: "Choose…" });
        expect(choose).toHaveLength(2);
        choose.forEach((button) => expect(button).toBeDisabled());
    });

    it("enables the custom sound choose buttons when notifications and sound are on", async () => {
        respondWithSettings(settingsWith({ notificationsEnabled: true, notificationsSoundEnabled: true }));
        renderPage();

        const choose = await screen.findAllByRole("button", { name: "Choose…" });
        await waitFor(() => choose.forEach((button) => expect(button).toBeEnabled()));
    });

    it("disables the sound switch once notifications are turned off", async () => {
        respondWithSettings(settingsWith({ notificationsEnabled: true, notificationsSoundEnabled: true }));
        renderPage();

        await userEvent.click(await screen.findByRole("switch", { name: /Show notifications/ }));

        expect(screen.getByRole("switch", { name: /Play a sound/ })).toHaveAttribute("aria-disabled", "true");
    });
});

describe("NotificationsPage display duration", () => {
    const savedDuration = () =>
        (chrome.runtime.sendMessage as any).mock.calls
            .map((call: any[]) => call[0])
            .filter((message: any) => message?.action === "saveSettings")
            .map((message: any) => deserializeSettings(message.settings)!.notificationsDurationMs)
            .at(-1);

    it("shows the stored milliseconds as seconds", async () => {
        const settings = getDefaultSettings();
        settings.notificationsDurationMs = 4500;
        respondWithSettings(settings);
        renderPage();

        expect(await screen.findByLabelText("Display duration")).toHaveValue("4.5");
    });

    it("stores the seconds typed in as milliseconds", async () => {
        respondWithSettings();
        renderPage();

        const field = await screen.findByLabelText("Display duration");
        await userEvent.clear(field);
        await userEvent.type(field, "2.5");
        await userEvent.tab();

        expect(savedDuration()).toBe(2500);
    });

    it("steps by half a second in both directions", async () => {
        const settings = getDefaultSettings();
        settings.notificationsDurationMs = 2000;
        respondWithSettings(settings);
        renderPage();

        await userEvent.click(await screen.findByRole("button", { name: "Increase display duration" }));
        expect(savedDuration()).toBe(2500);

        await userEvent.click(screen.getByRole("button", { name: "Decrease display duration" }));
        expect(savedDuration()).toBe(2000);
    });
});
