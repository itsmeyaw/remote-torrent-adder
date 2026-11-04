import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import SettingsSection from "../../../src/components/settings/SettingsSection";

describe("SettingsSection", () => {
    it("dims its header but not its body when disabled", () => {
        render(
            <SettingsSection title="Custom sounds" description="Your own files." disabled>
                <p>Body</p>
            </SettingsSection>,
        );

        expect(screen.getByText("Custom sounds").parentElement).toHaveClass("opacity-50");
        expect(screen.getByText("Body").parentElement).not.toHaveClass("opacity-50");
    });
});
