import { type RTASettings } from "../models/settings";
import { type Client } from "../models/clients";
import { type WebUISettings } from "../models/webui";

export function getDefaultSettings(): RTASettings {
    return {
        notificationsEnabled: true,
        notificationsDurationMs: 2000,
        notificationsSoundEnabled: false,
        notificationsLabelButtonEnabled: true,

        linkCatchingEnabled: true,
        linkCatchingRegexes: [
            /([\][]|\b|\.)\.torrent\b([^-]|$)/,
            /torrents\.php\?action=download/
        ],

        iconClickAction: "openPrimaryWebUi",

        webuiSettings: [] // TODO: should probably add an empty one? or not? who knows, i sure don't
    };
}

/** Every WebUI field with its default, including the ones added after older configs were saved. */
export function getDefaultWebUiFields(): Omit<WebUISettings, "id"> {
    return {
        // No client is chosen yet: the user picks one in the detail panel, which is
        // what reveals the rest of the configuration. Until then this entry is a
        // draft and is filtered out by consumers that resolve a concrete client.
        client: "" as Client,
        name: "",
        host: "",
        port: null,
        secure: false,
        relativePath: "",
        username: "",
        password: "",
        showPerTorrentConfigSelector: false,
        defaultLabel: null,
        defaultDir: null,
        labels: [],
        dirs: [],
        addPaused: false,
        autoLabelDirSettings: [],
        clientSpecificSettings: {},
        useAlternativeLabelDirChooser: false,
    };
}

export function createWebUiSettings(): WebUISettings {
    return { id: crypto.randomUUID(), ...getDefaultWebUiFields() };
}
