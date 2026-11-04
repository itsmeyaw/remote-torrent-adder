import { useState } from "react";
import { useSettings } from "../SettingsContext";
import Loading from "../components/Loading";
import WebUIList from "../components/webuis/WebUIList";
import WebUIDetail from "../components/webuis/WebUIDetail";
import type { WebUISettings } from "../../models/webui";
import { createWebUiSettings } from "../../settings/settings-defaults";

export { MAX_PORT, MIN_PORT, parsePortInput } from "../components/webuis/webui-helpers";

export function moveItem<T>(items: T[], from: number, to: number): T[] {
    if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
        return items;
    }
    const reordered = [...items];
    const [item] = reordered.splice(from, 1);
    if (item === undefined) {
        return items;
    }
    reordered.splice(to, 0, item);
    return reordered;
}

export default function WebUIsPage() {
    const { settings, updateSetting, loading } = useSettings();
    const [requestedId, setRequestedId] = useState<string | null>(null);

    const webuis = settings?.webuiSettings ?? [];

    // Default to the primary WebUI so the page never opens to an empty panel, and
    // keep the selection valid if the selected entry is removed. Derived during
    // render so no effect has to chase the settings list.
    const selectedId = webuis.some((w) => w.id === requestedId) ? requestedId : (webuis[0]?.id ?? null);

    if (loading || !settings) return <Loading />;

    const handleAdd = () => {
        const newWebUI = createWebUiSettings();
        updateSetting("webuiSettings", [...webuis, newWebUI]);
        setRequestedId(newWebUI.id);
    };

    const handleChange = (id: string, updated: WebUISettings) => {
        updateSetting(
            "webuiSettings",
            webuis.map((w) => (w.id === id ? updated : w)),
        );
    };

    const handleRemove = (id: string) => {
        updateSetting(
            "webuiSettings",
            webuis.filter((w) => w.id !== id),
        );
    };

    // The stored order is what the context menu and the "primary" WebUI are
    // derived from, so reordering the list is all this needs to do.
    const handleMove = (from: number, to: number) => {
        const reordered = moveItem(webuis, from, to);
        if (reordered !== webuis) updateSetting("webuiSettings", reordered);
    };

    const handlePromote = (id: string) => {
        handleMove(
            webuis.findIndex((w) => w.id === id),
            0,
        );
    };

    const selected = webuis.find((w) => w.id === selectedId) ?? null;

    return (
        <div className="grid grid-cols-[10.5rem_minmax(0,1fr)] items-start gap-6">
            <WebUIList
                webuis={webuis}
                selectedId={selectedId}
                onSelect={setRequestedId}
                onAdd={handleAdd}
                onMove={handleMove}
            />
            <div className="min-w-0">
                {selected ? (
                    <WebUIDetail
                        key={selected.id}
                        webui={selected}
                        onChange={(updated) => handleChange(selected.id, updated)}
                        onRemove={() => handleRemove(selected.id)}
                        onPromote={() => handlePromote(selected.id)}
                        isPrimary={webuis[0]?.id === selected.id}
                    />
                ) : (
                    <p className="pt-2 text-sm text-muted-foreground">
                        Select a WebUI on the left, or click + to add a new one.
                    </p>
                )}
            </div>
        </div>
    );
}
