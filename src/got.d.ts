/**
 * Minimal type declaration for dynamic import("got").
 * Got is ESM-only; we load it at runtime.
 */
declare module "got" {
    const got: (urlOrOptions: string | object) => Promise<{
        url: string;
        headers: Record<string, string | string[] | undefined>;
        statusCode: number;
        body: Buffer | string;
    }>;
    export default got;
}
