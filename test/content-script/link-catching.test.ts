import { describe, it, expect } from "vitest";
import { isMatchedByRegexes } from "../../src/content-script/link-catching";

describe("isMatchedByRegexes", () => {
    it("returns true when any regex matches", () => {
        expect(isMatchedByRegexes("foo.torrent", [/\.mp3$/, /\.torrent$/])).toBe(true);
    });

    it("returns false when none match", () => {
        expect(isMatchedByRegexes("foo.mp3", [/\.torrent$/])).toBe(false);
    });

    it("returns false for an empty regex list", () => {
        expect(isMatchedByRegexes("anything", [])).toBe(false);
    });

    it("ignores empty and whitespace-only patterns so they never match", () => {
        expect(isMatchedByRegexes("https://example.com/page", [new RegExp("")])).toBe(false);
        expect(isMatchedByRegexes("https://example.com/a b", [new RegExp(" ".repeat(3))])).toBe(false);
        expect(isMatchedByRegexes("https://example.com/a.torrent", [new RegExp(""), /\.torrent$/])).toBe(true);
    });
});
