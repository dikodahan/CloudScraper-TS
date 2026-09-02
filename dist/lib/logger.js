"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDebugShim = setDebugShim;
exports.isDebugShimEnabled = isDebugShimEnabled;
exports.log = log;
let shimLogger;
function setDebugShim(enabled) {
    shimLogger = enabled
        ? (level, msg, meta) => {
            const line = meta ? msg + " " + JSON.stringify(meta) : msg;
            if (level === "error")
                console.error(line);
            else
                console.warn(line);
        }
        : undefined;
}
function isDebugShimEnabled() {
    return !!shimLogger;
}
function log(logger, level, msg, meta) {
    const fn = logger ?? shimLogger;
    if (fn)
        fn(level, msg, meta);
}
