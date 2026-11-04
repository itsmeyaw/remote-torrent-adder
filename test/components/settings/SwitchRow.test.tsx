import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import SwitchRow from "../../../src/components/settings/SwitchRow";

describe("SwitchRow", () => {
    it("dims its label and description when disabled", () => {
        render(<SwitchRow label="Play a sound" description="Plays it." checked={false} disabled onChange={() => {}} />);

        expect(screen.getByText("Play a sound").parentElement).toHaveClass("opacity-50");
    });

    it("leaves its text at full strength when enabled", () => {
        render(<SwitchRow label="Play a sound" checked={false} onChange={() => {}} />);

        expect(screen.getByText("Play a sound").parentElement).not.toHaveClass("opacity-50");
    });
});
