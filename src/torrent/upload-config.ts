import { type Torrent, type TorrentUploadConfig } from "../models/torrent";
import { type WebUISettings } from "../models/webui";
import { explainAutoLabelDir } from "./auto-label-dir-matcher";

/** Where a resolved Label or Directory came from: the Winning Rule, the WebUI's default, or the first entry of its list. */
export type UploadConfigSource = "rule" | "default" | "list";

export interface ResolvedUploadConfig {
    /** The Upload Config to send: label/dir stay undefined when nothing resolves. */
    config: TorrentUploadConfig;
    /** Where label/dir came from, or null when nothing resolved. */
    source: { label: UploadConfigSource | null; dir: UploadConfigSource | null };
}

export type UploadConfigSettings = Pick<
    WebUISettings,
    "autoLabelDirSettings" | "defaultLabel" | "defaultDir" | "labels" | "dirs" | "addPaused"
>;

/** The one place that decides the Upload Config a torrent gets when nothing more specific was chosen. */
export function resolveUploadConfig(torrent: Torrent, webUiSettings: UploadConfigSettings): ResolvedUploadConfig {
    const explanation = explainAutoLabelDir(torrent, webUiSettings.autoLabelDirSettings);
    const label = firstResolved(explanation.label, webUiSettings.defaultLabel, webUiSettings.labels);
    const dir = firstResolved(explanation.dir, webUiSettings.defaultDir, webUiSettings.dirs);
    return {
        config: { label: label.value, dir: dir.value, addPaused: webUiSettings.addPaused },
        source: { label: label.source, dir: dir.source },
    };
}

function firstResolved(
    fromRule: string | null,
    defaultValue: string | null,
    list: string[],
): { value?: string; source: UploadConfigSource | null } {
    if (fromRule != null) {
        return { value: fromRule, source: "rule" };
    }
    if (defaultValue != null) {
        return { value: defaultValue, source: "default" };
    }
    const first = list[0];
    return first != null ? { value: first, source: "list" } : { source: null };
}
