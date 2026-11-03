/**
 * A failure that was already reported to the user, or deliberately silenced because notifications are off,
 * so nothing reports it again. The original error is kept as `cause`.
 */
export class HandledFailure extends Error {}
