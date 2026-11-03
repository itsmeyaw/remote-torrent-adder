import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientSpecificSettingsEditor from "../../../src/options/components/ClientSpecificSettingsEditor";
import type { ClientSpecificSettingDescriptor } from "../../../src/models/webui";

const descriptors: ReadonlyArray<ClientSpecificSettingDescriptor> = [
    { key: "flagOn", label: "Flag on", type: "boolean", default: true, perTorrent: false },
    { key: "flagOff", label: "Flag off", type: "boolean", default: false, perTorrent: false },
];

describe("ClientSpecificSettingsEditor", () => {
    it("shows the stored value, and the descriptor default when nothing is stored", () => {
        render(<ClientSpecificSettingsEditor descriptors={descriptors} value={{ flagOff: true }} onChange={vi.fn()} />);

        expect(screen.getByRole("checkbox", { name: "Flag on" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Flag off" })).toBeChecked();
    });

    it("reports the toggled value without dropping the other stored keys", async () => {
        const onChange = vi.fn();
        render(<ClientSpecificSettingsEditor descriptors={descriptors} value={{ flagOn: false }} onChange={onChange} />);

        await userEvent.click(screen.getByRole("checkbox", { name: "Flag off" }));

        expect(onChange).toHaveBeenCalledWith({ flagOn: false, flagOff: true });
    });
});
