import { sendMessage } from "../../util/messaging";
import { useEffect, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import Notice from "./Notice";
import OpenOptionsButton from "./OpenOptionsButton";
import PopupFrame from "./PopupFrame";
import { WebUIFactory } from "../../models/clients";
import { requestSettings } from "../../settings/request-settings";
import { addTrailingSlash } from "../../background/action";
import { surfaceClass } from "@/components/settings/SettingsSection";
import { cn } from "@/lib/utils";

interface WebUiOption {
    id: string;
    name: string;
    url: string;
}

type LoadState = { status: "loading" } | { status: "empty" } | { status: "ready"; options: WebUiOption[] };

export default function WebUiPickerView() {
    const [state, setState] = useState<LoadState>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;
        void requestSettings().then((settings) => {
            if (cancelled) return;
            const options: WebUiOption[] = (settings?.webuiSettings ?? [])
                .map((webUiSettings) => {
                    const webUi = WebUIFactory.createWebUI(webUiSettings);
                    if (!webUi) return null;
                    return {
                        id: webUiSettings.id,
                        name: webUiSettings.name || webUi.name,
                        url: addTrailingSlash(webUi.createBaseUrl()),
                    };
                })
                .filter((option): option is WebUiOption => option !== null);
            setState(options.length ? { status: "ready", options } : { status: "empty" });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const openWebUi = (webUiId: string) => {
        void sendMessage("openWebUi", { webUiId })
            .catch((error: unknown) => console.error("Failed opening the WebUI", error))
            .finally(() => window.close());
    };

    if (state.status === "loading") {
        return (
            <Notice title="Remote Torrent Adder" loading>
                Loading…
            </Notice>
        );
    }
    if (state.status === "empty") {
        return (
            <Notice title="No WebUIs configured" action={<OpenOptionsButton />}>
                Add a WebUI in the extension&apos;s options first.
            </Notice>
        );
    }

    return (
        <PopupFrame title="Choose a WebUI">
            <div className={cn(surfaceClass, "divide-y divide-border overflow-hidden")}>
                {state.options.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => openWebUi(option.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                    >
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-sm font-medium">{option.name}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">{option.url}</span>
                        </span>
                        <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                ))}
            </div>
        </PopupFrame>
    );
}
