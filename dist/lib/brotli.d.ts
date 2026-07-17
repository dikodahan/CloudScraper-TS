interface Brotli {
    isAvailable: boolean;
    decompress?: (buf: Buffer) => Buffer;
}
declare const brotli: Brotli;
export default brotli;
