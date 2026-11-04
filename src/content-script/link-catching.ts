export function isMatchedByRegexes(url: string, regexes: RegExp[]): boolean {
    return regexes.some((regex) => regex.source.trim() !== "" && regex.source !== "(?:)" && regex.test(url));
}
