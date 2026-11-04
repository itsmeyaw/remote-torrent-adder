import { useEffect, useState } from "react";
import { sendMessage } from "../../util/messaging";
import { Button } from "@/components/ui/button";
import Notice from "./Notice";
import PopupFrame from "./PopupFrame";
import OptionCombobox from "../components/OptionCombobox";
import { requestSettings } from "../../settings/request-settings";
import { findWebUiSettings } from "../../settings/webuis";
import { errorMessage, moveToFront } from "../lib/utils";

interface LabelTarget {
    webUiId: string;
    infoHash: string;
    torrentName: string;
}

type LoadState =
    | { status: "loading" }
    | { status: "invalid" }
    | { status: "ready"; webUiName: string; labelOptions: string[] };

export default function SetLabelView() {
    const [target] = useState(readLabelTarget);
    if (!target) {
        return <InvalidTargetNotice />;
    }
    return <SetLabelLoader target={target} />;
}

function SetLabelLoader({ target }: { target: LabelTarget }) {
    const [state, setState] = useState<LoadState>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;
        void requestSettings().then((settings) => {
            if (cancelled) return;
            const webUiSettings = settings ? findWebUiSettings(settings, target.webUiId) : undefined;
            setState(
                webUiSettings
                    ? { status: "ready", webUiName: webUiSettings.name, labelOptions: webUiSettings.labels }
                    : { status: "invalid" },
            );
        });
        return () => {
            cancelled = true;
        };
    }, [target]);

    if (state.status === "loading") {
        return (
            <Notice title="Remote Torrent Adder" loading>
                Loading…
            </Notice>
        );
    }
    if (state.status === "invalid") {
        return <InvalidTargetNotice />;
    }
    return <SetLabelForm target={target} webUiName={state.webUiName} initialLabelOptions={state.labelOptions} />;
}

function InvalidTargetNotice() {
    return (
        <Notice title="Nothing to label" tone="error">
            This torrent or its WebUI could not be found.
        </Notice>
    );
}

function SetLabelForm({
    target,
    webUiName,
    initialLabelOptions,
}: {
    target: LabelTarget;
    webUiName: string;
    initialLabelOptions: string[];
}) {
    const [label, setLabel] = useState(initialLabelOptions[0] ?? "");
    const [labelOptions, setLabelOptions] = useState(initialLabelOptions);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleSubmit = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            await sendMessage("setTorrentLabel", {
                ...target,
                label,
                labels: moveToFront(label, labelOptions),
            });
            window.close();
        } catch (error: unknown) {
            console.error("Failed setting the label", error);
            setSubmitError(errorMessage(error));
            setSubmitting(false);
        }
    };

    const removeLabel = (option: string) => {
        setLabelOptions((previous) => previous.filter((entry) => entry !== option));
        if (label === option) setLabel("");
    };

    return (
        <PopupFrame title="Add label" subtitle={`${target.torrentName} in ${webUiName}`}>
            <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (label && !submitting) void handleSubmit();
                }}
            >
                <OptionCombobox
                    className="flex-1"
                    label="Label"
                    placeholder="Select or type label..."
                    value={label}
                    onChange={setLabel}
                    options={labelOptions}
                    onRemoveOption={removeLabel}
                />
                <Button type="submit" disabled={submitting || !label}>
                    {submitting ? "Setting…" : "Set label"}
                </Button>
            </form>

            {submitError && (
                <p role="alert" className="text-sm text-destructive">
                    {submitError}
                </p>
            )}
        </PopupFrame>
    );
}

function readLabelTarget(): LabelTarget | null {
    const params = new URLSearchParams(window.location.search);
    const webUiId = params.get("webUiId");
    const infoHash = params.get("infoHash");
    if (!webUiId || !infoHash) {
        return null;
    }
    return { webUiId, infoHash, torrentName: params.get("torrentName") ?? infoHash };
}
