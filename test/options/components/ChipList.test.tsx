import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChipList from "../../../src/options/components/ChipList";

describe("ChipList", () => {
    it("adds a trimmed entry when Enter is pressed", async () => {
        const onChange = vi.fn();
        render(
            <ChipList label="Labels" itemName="label" values={["tv"]} onChange={onChange} placeholder="Add label" />,
        );

        await userEvent.type(screen.getByPlaceholderText("Add label"), "  movies {Enter}");

        expect(onChange).toHaveBeenCalledWith(["tv", "movies"]);
    });

    it("ignores blank and duplicate entries", async () => {
        const onChange = vi.fn();
        render(
            <ChipList label="Labels" itemName="label" values={["tv"]} onChange={onChange} placeholder="Add label" />,
        );

        await userEvent.type(screen.getByPlaceholderText("Add label"), "   {Enter}");
        await userEvent.type(screen.getByPlaceholderText("Add label"), "tv{Enter}");

        expect(onChange).not.toHaveBeenCalled();
    });

    it("removes an entry from its own chip, named after the item kind", async () => {
        const onChange = vi.fn();
        render(<ChipList label="Directories" itemName="directory" values={["tv", "movies"]} onChange={onChange} />);

        await userEvent.click(screen.getByRole("button", { name: "Remove directory movies" }));

        expect(onChange).toHaveBeenCalledWith(["tv"]);
    });

    it("edits an entry in place", async () => {
        const onChange = vi.fn();
        render(<ChipList label="Labels" itemName="label" values={["tv"]} onChange={onChange} />);

        await userEvent.type(screen.getByDisplayValue("tv"), "x");

        expect(onChange).toHaveBeenCalledWith(["tvx"]);
    });
});
