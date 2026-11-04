import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import OptionCombobox from "../../src/popup/components/OptionCombobox";

function Harness({
    initial = "",
    options = ["movies", "tv"],
    onRemoveOption = () => undefined,
    autoPicked = false,
}: {
    initial?: string;
    options?: string[];
    onRemoveOption?: (option: string) => void;
    autoPicked?: boolean;
}) {
    const [value, setValue] = useState(initial);
    return (
        <OptionCombobox
            label="Label"
            placeholder="Select or type label..."
            value={value}
            onChange={setValue}
            options={options}
            onRemoveOption={onRemoveOption}
            autoPicked={autoPicked}
        />
    );
}

describe("OptionCombobox", () => {
    it("labels the input so it can be found by its visible label", () => {
        render(<Harness />);

        expect(screen.getByLabelText("Label")).toHaveAttribute("placeholder", "Select or type label...");
    });

    it("sets the value to whatever is typed", async () => {
        render(<Harness />);

        await userEvent.type(screen.getByLabelText("Label"), "dvd");

        expect(screen.getByLabelText("Label")).toHaveValue("dvd");
    });

    it("selects a known option from the list", async () => {
        render(<Harness />);
        const input = screen.getByLabelText("Label");

        await userEvent.click(screen.getByRole("button", { name: "Show label options" }));
        await userEvent.click(await screen.findByText("tv"));

        expect(input).toHaveValue("tv");
    });

    it("offers every option when the field already holds one, so switching needs no clearing", async () => {
        render(<Harness initial="movies" />);

        await userEvent.click(screen.getByLabelText("Label"));

        expect(await screen.findByRole("option", { name: /tv/ })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: /movies/ })).toBeInTheDocument();
    });

    it("narrows the options to what is typed", async () => {
        render(<Harness />);

        await userEvent.type(screen.getByLabelText("Label"), "MOV");

        expect(await screen.findByRole("option", { name: /movies/ })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /tv/ })).not.toBeInTheDocument();
    });

    it("forgets an option without selecting it", async () => {
        const onRemoveOption = vi.fn();
        render(<Harness onRemoveOption={onRemoveOption} />);
        const input = screen.getByLabelText("Label");

        await userEvent.click(screen.getByRole("button", { name: "Show label options" }));
        await userEvent.click(await screen.findByTitle("Forget tv"));

        expect(onRemoveOption).toHaveBeenCalledWith("tv");
        expect(input).toHaveValue("");
    });

    it("forgets the highlighted option with Shift+Delete", async () => {
        const onRemoveOption = vi.fn();
        render(<Harness onRemoveOption={onRemoveOption} />);
        const input = screen.getByLabelText("Label");

        await userEvent.click(input);
        await userEvent.keyboard("{ArrowDown}{Shift>}{Delete}{/Shift}");

        expect(onRemoveOption).toHaveBeenCalledWith("movies");
        expect(input).toHaveValue("");
    });

    it("marks the current value in the list", async () => {
        render(<Harness initial="tv" />);

        await userEvent.click(screen.getByLabelText("Label"));

        const current = await screen.findByRole("option", { name: "tv" });
        expect(current.querySelector("svg:not(.invisible)")).not.toBeNull();
        expect(screen.getByRole("option", { name: "movies" }).querySelector("svg.invisible")).not.toBeNull();
    });

    it("hints that a typed value is new", async () => {
        render(<Harness />);

        await userEvent.type(screen.getByLabelText("Label"), "dvd");

        expect(screen.getByText("New")).toBeInTheDocument();
    });

    it("does not hint for a value that is already known", async () => {
        render(<Harness initial="movies" />);

        expect(screen.queryByText("New")).not.toBeInTheDocument();
    });

    it("marks a value picked by an automatic rule", () => {
        render(<Harness initial="movies" autoPicked />);

        expect(screen.getByText("Auto")).toBeInTheDocument();
    });

    it("does not mark a manually chosen value as automatic", () => {
        render(<Harness initial="movies" />);

        expect(screen.queryByText("Auto")).not.toBeInTheDocument();
    });
});
