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

    it("names the winning rule's outcome in words", async () => {
        render(
            <AutoLabelDirTester
                settings={[{ criteria: [{ field: "trackerUrl", value: "" }], label: "movies", dir: "/rule" }]}
                defaultLabel={null}
                defaultDir={null}
                labels={[]}
                dirs={[]}
                showLabel
                showDir
            />,
        );

        await userEvent.type(screen.getByPlaceholderText("…or paste a magnet link"), "magnet:?xt=urn:btih:abc");
        await userEvent.click(screen.getByRole("button", { name: "Test" }));

        expect(screen.getByText('Applied: label "movies", directory "/rule"')).toBeInTheDocument();
    });

    it("shows the torrent contents only when its disclosure is opened", async () => {
        render(
            <AutoLabelDirTester
                settings={[]}
                defaultLabel={null}
                defaultDir={null}
                labels={[]}
                dirs={[]}
                showLabel
                showDir
            />,
        );

        await userEvent.type(
            screen.getByPlaceholderText("…or paste a magnet link"),
            "magnet:?xt=urn:btih:abc&dn=Cool&tr=udp%3A%2F%2Ftracker.example%3A80",
        );
        await userEvent.click(screen.getByRole("button", { name: "Test" }));

        const disclosure = screen.getByRole("button", { name: /Torrent contents/ });
        expect(disclosure).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByText("udp://tracker.example:80")).not.toBeInTheDocument();

        await userEvent.click(disclosure);

        expect(disclosure).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("udp://tracker.example:80")).toBeInTheDocument();
    });
});
