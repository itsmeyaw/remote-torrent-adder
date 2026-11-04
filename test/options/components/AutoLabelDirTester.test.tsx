import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AutoLabelDirTester from "../../../src/options/components/AutoLabelDirTester";

describe("AutoLabelDirTester", () => {
    it("previews the same Label and Directory the Add would send, down to the first list entry", async () => {
        render(
            <AutoLabelDirTester
                settings={[{ criteria: [{ field: "torrentName", value: "nomatch" }], label: "rule", dir: null }]}
                defaultLabel={null}
                defaultDir="/default"
                labels={["movies", "tv"]}
                dirs={[]}
                showLabel
                showDir
            />,
        );

        await userEvent.type(screen.getByPlaceholderText("…or paste a magnet link"), "magnet:?xt=urn:btih:abc&dn=Cool");
        await userEvent.click(screen.getByRole("button", { name: "Test" }));

        expect(screen.getByText("movies")).toBeInTheDocument();
        expect(screen.getByText("from the label list")).toBeInTheDocument();
        expect(screen.getByText("/default")).toBeInTheDocument();
        expect(screen.getByText("from the default directory")).toBeInTheDocument();
    });
});
