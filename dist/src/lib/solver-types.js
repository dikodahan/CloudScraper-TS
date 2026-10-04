"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSolverResult = isSolverResult;
function isSolverResult(value) {
    return !!value && typeof value === "object" && typeof value.userAgent === "string" && value.userAgent.length > 0;
}
