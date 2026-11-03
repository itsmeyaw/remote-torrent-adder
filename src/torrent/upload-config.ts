import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type WebUISettings } from "../models/webui";
import { explainAutoLabelDir } from "./auto-label-dir-matcher";

export interface ResolvedUploadConfig {
    /** The Upload Config to send: label/dir stay undefined when nothing resolves. */
    config: TorrentUploadConfig;
    /** Whether label/dir came from the Winning Rule; the popup highlights these. */
    fromRule: { label: boolean; dir: boolean };
}

/** The one place that decides the Upload Config a torrent gets when nothing more specific was chosen. */
export function resolveUploadConfig(torrent: Torrent, webUiSettings: WebUISettings): ResolvedUploadConfig {
    const explanation = explainAutoLabelDir(torrent, webUiSettings.autoLabelDirSettings);
    return {
        config: {
            label: explanation.label ?? webUiSettings.defaultLabel ?? webUiSettings.labels[0],
            dir: explanation.dir ?? webUiSettings.defaultDir ?? webUiSettings.dirs[0],
            addPaused: webUiSettings.addPaused,
        },
        fromRule: {
            label: explanation.label !== null,
            dir: explanation.dir !== null,
        },
    };
}
