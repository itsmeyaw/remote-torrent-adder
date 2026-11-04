import { describe, expect, it } from "vitest";
import { resolveUploadConfig } from "../../src/torrent/upload-config";
import { makeMagnetTorrent, makeWebUISettings } from "../helpers/fixtures";

const ruleFor = (label: string | null, dir: string | null) => ({
    criteria: [{ field: "torrentName" as const, value: "cool" }],
    label,
    dir,
});

describe("resolveUploadConfig", () => {
    it.each([
        {
            name: "a Winning Rule beats the default and the list",
            settings: {
                autoLabelDirSettings: [ruleFor("rule-label", "/rule-dir")],
                defaultLabel: "tv",
                defaultDir: "/def",
                labels: ["movies"],
                dirs: ["/list"],
            },
            label: "rule-label",
            dir: "/rule-dir",
            source: { label: "rule", dir: "rule" },
        },
        {
            name: "the default beats the list when there is no rule",
            settings: { defaultLabel: "tv", defaultDir: "/def", labels: ["movies"], dirs: ["/list"] },
            label: "tv",
            dir: "/def",
            source: { label: "default", dir: "default" },
        },
        {
            name: "the first list entry is used when there is no default (the bug case)",
            settings: { defaultLabel: null, defaultDir: null, labels: ["movies", "tv"], dirs: ["/data", "/other"] },
            label: "movies",
            dir: "/data",
            source: { label: "list", dir: "list" },
        },
        {
            name: "nothing configured resolves to undefined",
            settings: { defaultLabel: null, defaultDir: null, labels: [], dirs: [] },
            label: undefined,
            dir: undefined,
            source: { label: null, dir: null },
        },
        {
            name: "a rule that sets only a label lets the directory fall to the default",
            settings: { autoLabelDirSettings: [ruleFor("rule-label", null)], defaultDir: "/def", dirs: ["/list"] },
            label: "rule-label",
            dir: "/def",
            source: { label: "rule", dir: "default" },
        },
        {
            name: "a rule that sets only a directory lets the label fall to the list",
            settings: { autoLabelDirSettings: [ruleFor(null, "/rule-dir")], labels: ["movies"] },
            label: "movies",
            dir: "/rule-dir",
            source: { label: "list", dir: "rule" },
        },
        {
            name: "an empty-string default is kept, not skipped",
            settings: { defaultLabel: "", defaultDir: "", labels: ["movies"], dirs: ["/data"] },
            label: "",
            dir: "",
            source: { label: "default", dir: "default" },
        },
    ])("$name", ({ settings, label, dir, source }) => {
        const result = resolveUploadConfig(makeMagnetTorrent(), makeWebUISettings(settings));

        expect(result.config.label).toBe(label);
        expect(result.config.dir).toBe(dir);
        expect(result.source).toEqual(source);
    });

    it.each([{ addPaused: true }, { addPaused: false }])(
        "carries addPaused=$addPaused from the WebUI settings",
        ({ addPaused }) => {
            const result = resolveUploadConfig(makeMagnetTorrent(), makeWebUISettings({ addPaused }));

            expect(result.config.addPaused).toBe(addPaused);
        },
    );
});
