import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ext } from "../../util/browser-api";

export default function OpenOptionsButton() {
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={() => {
                void ext.runtime.openOptionsPage().finally(() => window.close());
            }}
        >
            <SettingsIcon data-icon="inline-start" />
            Open options
        </Button>
    );
}
