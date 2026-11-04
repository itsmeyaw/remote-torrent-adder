export function moveToFront(value: string, options: string[]): string[] {
    return value ? [value, ...options.filter((option) => option !== value)] : options;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
