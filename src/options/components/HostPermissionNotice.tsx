import { useCallback, useEffect, useState } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ext } from "../../util/browser-api";

const ALL_URLS = { origins: ["<all_urls>"] };

export default function HostPermissionNotice() {
    const [granted, setGranted] = useState(true);

    const check = useCallback(() => {
        ext.permissions
            .contains(ALL_URLS)
            .then(setGranted)
            .catch(() => setGranted(true));
    }, []);

    useEffect(() => {
        check();
        ext.permissions.onAdded.addListener(check);
        ext.permissions.onRemoved.addListener(check);
        return () => {
            ext.permissions.onAdded.removeListener(check);
            ext.permissions.onRemoved.removeListener(check);
        };
    }, [check]);

    if (granted) {
        return null;
    }

    return (
        <Alert variant="destructive">
            <ShieldAlertIcon />
            <AlertTitle>Websites are blocked</AlertTitle>
            <AlertDescription>
                <p>
                    Remote Torrent Adder cannot access websites, so torrent links will not be caught and your clients
                    cannot be reached.
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 text-foreground"
                    onClick={() => {
                        void ext.permissions.request(ALL_URLS).then(setGranted);
                    }}
                >
                    Grant access
                </Button>
            </AlertDescription>
        </Alert>
    );
}
