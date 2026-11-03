import { describe, it, expect } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsProvider, useSettings } from "../../src/options/SettingsContext";
import { GetSettingsMessage, SaveSettingsMessage } from "../../src/models/messages";
import { serializeSettings, deserializeSettings } from "../../src/util/serializer";
import { getDefaultSettings } from "../../src/util/settings-defaults";
import { callArgs } from "../helpers/assert";
import { makeWebUISettings } from "../helpers/fixtures";

/** Answers GetSettings with the given settings, like the service worker does. */
function respondWithSettings(settings = getDefaultSettings()) {
    (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
        if (message.action === GetSettingsMessage.action) {
            return Promise.resolve(serializeSettings(settings));
        }
        return Promise.resolve();
    });
}

function Probe() {
    const { settings, updateSetting, loading } = useSettings();
    if (loading) return <div>loading</div>;
    return (
        <div>
            <span data-testid="duration">{settings?.notificationsDurationMs}</span>
            <span data-testid="labels">{settings?.webuiSettings[0]?.labels.join(",")}</span>
            <button onClick={() => updateSetting("notificationsDurationMs", 9999)}>bump</button>
            <button onClick={() => updateSetting("notificationsDurationMs", 7777)}>bump again</button>
        </div>
    );
}

const renderProbe = () => render(<SettingsProvider><Probe /></SettingsProvider>);

describe("SettingsContext", () => {
    it("shows a loading state until settings arrive", () => {
        (chrome.runtime.sendMessage as any).mockImplementation(() => new Promise(() => {}));

        renderProbe();

        expect(screen.getByText("loading")).toBeInTheDocument();
    });

    it("exposes the settings the service worker returns", async () => {
        const stored = getDefaultSettings();
        stored.notificationsDurationMs = 4321;
        respondWithSettings(stored);

        renderProbe();

        expect(await screen.findByTestId("duration")).toHaveTextContent("4321");
    });

    it("sends an updated setting back to the service worker", async () => {
        respondWithSettings();
        renderProbe();
        await screen.findByTestId("duration");

        await userEvent.click(screen.getByRole("button", { name: "bump" }));

        await waitFor(() => {
            const saves = (chrome.runtime.sendMessage as any).mock.calls
                .filter((call: any[]) => call[0]?.action === SaveSettingsMessage.action);
            expect(saves).toHaveLength(1);
        });
    });

    it("persists the full settings object, not just the changed key", async () => {
        const stored = getDefaultSettings();
        stored.notificationsSoundEnabled = true;
        respondWithSettings(stored);
        renderProbe();
        await screen.findByTestId("duration");

        await userEvent.click(screen.getByRole("button", { name: "bump" }));

        await waitFor(() => {
            const save = (chrome.runtime.sendMessage as any).mock.calls
                .find((call: any[]) => call[0]?.action === SaveSettingsMessage.action);
            const persisted = deserializeSettings(save[0].settings)!;
            expect(persisted.notificationsDurationMs).toBe(9999);
            expect(persisted.notificationsSoundEnabled).toBe(true);
        });
    });

    it("reflects the new value immediately, without waiting for a round trip", async () => {
        respondWithSettings();
        renderProbe();
        await screen.findByTestId("duration");

        await userEvent.click(screen.getByRole("button", { name: "bump" }));

        expect(screen.getByTestId("duration")).toHaveTextContent("9999");
    });

    it("requests settings exactly once on mount", async () => {
        respondWithSettings();
        renderProbe();
        await screen.findByTestId("duration");

        const gets = (chrome.runtime.sendMessage as any).mock.calls
            .filter((call: any[]) => call[0]?.action === GetSettingsMessage.action);
        expect(gets).toHaveLength(1);
        expect(callArgs(chrome.runtime.sendMessage as any, 0)[0].action).toBe(GetSettingsMessage.action);
    });

    it("keeps a label the background wrote while the page was open", async () => {
        const stored = getDefaultSettings();
        stored.webuiSettings = [makeWebUISettings({ id: "webui-1", labels: ["movies"] })];
        respondWithSettings(stored);
        renderProbe();
        await screen.findByTestId("duration");

        const fromBackground = { ...stored, webuiSettings: [makeWebUISettings({ id: "webui-1", labels: ["movies", "tv"] })] };
        await chrome.storage.local.set({ settings: serializeSettings(fromBackground) });
        await waitFor(() => expect(screen.getByTestId("labels")).toHaveTextContent("movies,tv"));
        await userEvent.click(screen.getByRole("button", { name: "bump" }));

        await waitFor(() => {
            const save = (chrome.runtime.sendMessage as any).mock.calls
                .find((call: any[]) => call[0]?.action === SaveSettingsMessage.action);
            expect(deserializeSettings(save[0].settings)!.webuiSettings[0]!.labels).toEqual(["movies", "tv"]);
        });
    });

    it("does not let a late echo of its own save overwrite a newer edit", async () => {
        const saves: string[] = [];
        respondWithSettings();
        (chrome.runtime.sendMessage as any).mockImplementation((message: any) => {
            if (message.action === GetSettingsMessage.action) return Promise.resolve(serializeSettings(getDefaultSettings()));
            if (message.action === SaveSettingsMessage.action) saves.push(message.settings);
            return Promise.resolve();
        });
        renderProbe();
        await screen.findByTestId("duration");

        await userEvent.click(screen.getByRole("button", { name: "bump" }));
        await userEvent.click(screen.getByRole("button", { name: "bump again" }));
        await act(async () => {
            await chrome.storage.local.set({ settings: saves[0] });
        });

        expect(screen.getByTestId("duration")).toHaveTextContent("7777");
    });

    it("ignores a storage change that is not settings", async () => {
        respondWithSettings();
        renderProbe();
        await screen.findByTestId("duration");

        await act(async () => {
            await chrome.storage.local.set({ settings: "null" });
        });

        expect(screen.getByTestId("duration")).toHaveTextContent("2000");
    });

    it("shows an error instead of loading forever when settings cannot be read", async () => {
        renderProbe();

        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load settings");
        expect(screen.queryByText("loading")).not.toBeInTheDocument();
        expect(screen.queryByTestId("duration")).not.toBeInTheDocument();
    });

    it("shows the same error when the stored settings cannot be parsed", async () => {
        (chrome.runtime.sendMessage as any).mockImplementation(() => Promise.resolve("{not json"));

        renderProbe();

        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load settings");
    });

    it("throws when used outside a provider, rather than silently returning nothing", () => {
        expect(() => render(<Probe />)).toThrow(/must be used within a SettingsProvider/);
    });
});
