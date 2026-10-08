/** Type argument for `vi.fn<AnyFn>()`. Mock functions must be typed (a lint rule), but these are
 *  stand-ins for whatever signature a component or API expects, so any argument list is accepted. */
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyFn = (...args: any[]) => any;
