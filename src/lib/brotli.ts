import * as zlib from "zlib";

interface Brotli {
    isAvailable: boolean;
    decompress?: (buf: Buffer) => Buffer;
}

const brotli: Brotli = {
    isAvailable: false,
};

// Node has built-in brotli support since v11.7; on Node >=24 this is always available.
if (typeof zlib.brotliDecompressSync === "function") {
    brotli.decompress = function (buf: Buffer): Buffer {
        return zlib.brotliDecompressSync(buf);
    };
    brotli.isAvailable = true;
} else {
    // Fallback for exotic runtimes without native brotli: use the optional "brotli" package if present.
    // The module id is computed to avoid bundlers (e.g. webpack) trying to resolve an optional package.
    try {
        const optionalRequire = eval("require") as NodeRequire;
        const moduleId = ["brotli", "decompress"].join("/");
        const decompress = optionalRequire(moduleId) as (buf: Buffer) => Uint8Array;
        brotli.decompress = function (buf: Buffer): Buffer {
            return Buffer.from(decompress(buf));
        };
        brotli.isAvailable = typeof decompress === "function";
    } catch {
        brotli.isAvailable = false;
    }
}

export default brotli;
