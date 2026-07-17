"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const zlib = __importStar(require("zlib"));
const brotli = {
    isAvailable: false,
};
// Node has built-in brotli support since v11.7; on Node >=24 this is always available.
if (typeof zlib.brotliDecompressSync === "function") {
    brotli.decompress = function (buf) {
        return zlib.brotliDecompressSync(buf);
    };
    brotli.isAvailable = true;
}
else {
    // Fallback for exotic runtimes without native brotli: use the optional "brotli" package if present.
    // The module id is computed to avoid bundlers (e.g. webpack) trying to resolve an optional package.
    try {
        const optionalRequire = eval("require");
        const moduleId = ["brotli", "decompress"].join("/");
        const decompress = optionalRequire(moduleId);
        brotli.decompress = function (buf) {
            return Buffer.from(decompress(buf));
        };
        brotli.isAvailable = typeof decompress === "function";
    }
    catch {
        brotli.isAvailable = false;
    }
}
exports.default = brotli;
