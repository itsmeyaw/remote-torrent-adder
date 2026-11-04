import { describe, it, expect, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AutoLabelDirSettingsEditor from "../../../src/options/components/AutoLabelDirSettingsEditor";

const renderEditor = (onChange = vi.fn()) =>
    render(
        <AutoLabelDirSettingsEditor
            value={[{ criteria: [], label: null, dir: null }]}
            onChange={onChange}
            showLabel
            showDir
            labels={[]}
            dirs={[]}
            defaultLabel={null}
            defaultDir={null}
        />,
    );

describe("AutoLabelDirSettingsEditor", () => {
    it("adds a criterion when Enter is pressed in the value field", async () => {
        const onChange = vi.fn();
        renderEditor(onChange);

        await userEvent.type(screen.getByRole("textbox", { name: "Criterion value" }), "tracker\\.org{Enter}");

        expect(onChange).toHaveBeenCalledWith([
            { criteria: [{ field: "trackerUrl", value: "tracker\\.org" }], label: null, dir: null },
        ]);
    });

    it("removes the rule it belongs to", async () => {
        const onChange = vi.fn();
        renderEditor(onChange);

        await userEvent.click(screen.getByRole("button", { name: "Remove rule 1" }));

        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("does not carry an unsent criterion from a removed rule into the rule that takes its place", async () => {
        const rule = { criteria: [], label: null, dir: null };
        const props = { showLabel: true, showDir: true, labels: [], dirs: [], defaultLabel: null, defaultDir: null };
        const { rerender } = render(<AutoLabelDirSettingsEditor value={[rule, rule]} onChange={vi.fn()} {...props} />);

        await userEvent.type(screen.getAllByRole("textbox", { name: "Criterion value" })[0]!, "draft");
        await userEvent.click(screen.getAllByRole("button", { name: /Remove rule/ })[0]!);
        rerender(<AutoLabelDirSettingsEditor value={[rule]} onChange={vi.fn()} {...props} />);

        expect(screen.getByRole("textbox", { name: "Criterion value" })).toHaveValue("");
    });

    it("keeps an unsent criterion in its rule when another rule is added", async () => {
        const rule = { criteria: [], label: null, dir: null };
        const props = { showLabel: true, showDir: true, labels: [], dirs: [], defaultLabel: null, defaultDir: null };
        const { rerender } = render(<AutoLabelDirSettingsEditor value={[rule]} onChange={vi.fn()} {...props} />);

        await userEvent.type(screen.getByRole("textbox", { name: "Criterion value" }), "draft");
        await userEvent.click(screen.getByRole("button", { name: "Add Rule" }));
        rerender(<AutoLabelDirSettingsEditor value={[rule, rule]} onChange={vi.fn()} {...props} />);

        expect(
            screen
                .getAllByRole("textbox", { name: "Criterion value" })
                .map((input) => (input as HTMLInputElement).value),
        ).toEqual(["draft", ""]);
    });
});

describe("AutoLabelDirSettingsEditor criteria", () => {
    it("names each criterion's remove button after its field and value", async () => {
        const onChange = vi.fn();
        render(
            <AutoLabelDirSettingsEditor
                value={[{ criteria: [{ field: "torrentName", value: "2160p" }], label: null, dir: null }]}
                onChange={onChange}
                showLabel
                showDir
                labels={[]}
                dirs={[]}
                defaultLabel={null}
                defaultDir={null}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Remove criterion Torrent name 2160p" }));

        expect(onChange).toHaveBeenCalledWith([{ criteria: [], label: null, dir: null }]);
    });
});

describe("AutoLabelDirSettingsEditor criterion adder", () => {
    it("stays folded on a rule that already has criteria until asked for", async () => {
        const onChange = vi.fn();
        render(
            <AutoLabelDirSettingsEditor
                value={[{ criteria: [{ field: "torrentName", value: "2160p" }], label: null, dir: null }]}
                onChange={onChange}
                showLabel
                showDir
                labels={[]}
                dirs={[]}
                defaultLabel={null}
                defaultDir={null}
            />,
        );

        expect(screen.queryByRole("textbox", { name: "Criterion value" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Add criterion" }));
        await userEvent.type(screen.getByRole("textbox", { name: "Criterion value" }), "\\.mkv${Enter}");

        expect(onChange).toHaveBeenCalledWith([
            {
                criteria: [
                    { field: "torrentName", value: "2160p" },
                    { field: "trackerUrl", value: "\\.mkv$" },
                ],
                label: null,
                dir: null,
            },
        ]);
    });
});
