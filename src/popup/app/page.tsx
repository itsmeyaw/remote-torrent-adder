import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Notice from "./Notice";
import OpenOptionsButton from "./OpenOptionsButton";
import PopupFrame from "./PopupFrame";
import WebUiPickerView from "./WebUiPickerView";
import PageLinksView from "./PageLinksView";
import SetLabelView from "./SetLabelView";
import OptionCombobox from "../components/OptionCombobox";
import SwitchRow from "@/components/settings/SwitchRow";
import { surfaceClass } from "@/components/settings/SettingsSection";
import { cn } from "@/lib/utils";
import { errorMessage, moveToFront } from "../lib/utils";
import { loadPopupData, submitTorrent, type PopupData } from "../popup-data";
import { resolveClientSpecificSetting } from "../../models/webui";

type LoadState =
    | { status: "loading" }
    | { status: "empty" }
    | { status: "failed"; message: string }
    | { status: "ready"; data: PopupData };

export default function Home() {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "picker") {
        return <WebUiPickerView />;
    }
    if (mode === "links") {
        return <PageLinksView />;
    }
    if (mode === "label") {
        return <SetLabelView />;
    }

    return <BufferedTorrentForm />;
}

function BufferedTorrentForm() {
    const [state, setState] = useState<LoadState>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;
        const bufferedId = new URLSearchParams(window.location.search).get("buffered") ?? "";
        loadPopupData(bufferedId)
            .then((data) => {
                if (cancelled) return;
                setState(data ? { status: "ready", data } : { status: "empty" });
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                console.error("Failed loading the pending torrent", error);
                setState({ status: "failed", message: errorMessage(error) });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (state.status === "loading") {
        return (
            <Notice title="Remote Torrent Adder" loading>
                Loading…
            </Notice>
        );
    }
    if (state.status === "empty") {
        return (
            <Notice title="Nothing to add" action={<OpenOptionsButton />}>
                No torrent is waiting to be added.
            </Notice>
        );
    }
    if (state.status === "failed") {
        return (
            <Notice title="Could not load the torrent" tone="error">
                {state.message}
            </Notice>
        );
    }
    return <AddTorrentForm data={state.data} />;
}

// The form only mounts once the data exists, so every field can be initialised
// straight from it and no value is ever asserted non-null.
function AddTorrentForm({ data }: { data: PopupData }) {
    const [label, setLabel] = useState(data.initial.label);
    const [directory, setDirectory] = useState(data.initial.directory);
    const [paused, setPaused] = useState(data.initial.paused);
    const [clientSpecific, setClientSpecific] = useState(data.clientSpecific.initial);
    const [labelOptions, setLabelOptions] = useState(data.labelOptions);
    const [directoryOptions, setDirectoryOptions] = useState(data.directoryOptions);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleSubmit = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            await submitTorrent({
                bufferedId: data.bufferedId,
                label,
                directory,
                paused,
                clientSpecific,
                // Whatever was just used moves to the front, so it is offered first next time.
                labelOptions: moveToFront(label, labelOptions),
                directoryOptions: moveToFront(directory, directoryOptions),
            });
            window.close();
        } catch (error: unknown) {
            console.error("Failed adding the torrent", error);
            setSubmitError(errorMessage(error));
            setSubmitting(false);
        }
    };

    const removeLabel = (option: string) => {
        setLabelOptions((previous) => previous.filter((entry) => entry !== option));
        if (label === option) setLabel("");
    };

    const removeDirectory = (option: string) => {
        setDirectoryOptions((previous) => previous.filter((entry) => entry !== option));
        if (directory === option) setDirectory("");
    };

    const toggles = [
        ...(data.supports.paused
            ? [{ key: "paused", label: "Start paused", checked: paused, onChange: setPaused }]
            : []),
        ...data.clientSpecific.descriptors.map((descriptor) => ({
            key: descriptor.key,
            label: descriptor.label,
            checked: resolveClientSpecificSetting(
                descriptor.key,
                data.clientSpecific.descriptors,
                undefined,
                clientSpecific,
            ),
            onChange: (value: boolean) => setClientSpecific((previous) => ({ ...previous, [descriptor.key]: value })),
        })),
    ];

    return (
        <PopupFrame title="Add torrent" subtitle={data.torrent.name}>
            <div className="flex flex-col gap-4">
                {data.supports.label && (
                    <OptionCombobox
                        label="Label"
                        placeholder="Select or type label..."
                        value={label}
                        onChange={setLabel}
                        options={labelOptions}
                        onRemoveOption={removeLabel}
                        autoPicked={data.auto.label}
                    />
                )}

                {data.supports.directory && (
                    <OptionCombobox
                        label="Directory"
                        placeholder="Select or type directory..."
                        value={directory}
                        onChange={setDirectory}
                        options={directoryOptions}
                        onRemoveOption={removeDirectory}
                        autoPicked={data.auto.directory}
                    />
                )}
            </div>

            {toggles.length > 0 && (
                <div className={cn(surfaceClass, "divide-y divide-border overflow-hidden")}>
                    {toggles.map((toggle) => (
                        <SwitchRow
                            key={toggle.key}
                            label={toggle.label}
                            checked={toggle.checked}
                            onChange={toggle.onChange}
                        />
                    ))}
                </div>
            )}

            {submitError && (
                <p role="alert" className="text-sm text-destructive">
                    {submitError}
                </p>
            )}

            <Button onClick={() => void handleSubmit()} disabled={submitting} className="w-full">
                {submitting ? "Adding…" : "Add torrent"}
            </Button>
        </PopupFrame>
    );
}
