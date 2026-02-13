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
exports.Context = void 0;
exports.evaluate = evaluate;
const vm = __importStar(require("vm"));
const VM_OPTIONS = {
    filename: "iuam-challenge.js",
    contextOrigin: "cloudflare:iuam-challenge.js",
    contextCodeGeneration: { strings: true, wasm: false },
    timeout: 5000,
};
const VM_ENV = `
  (function (global) {
    const cache = Object.create(null);
    const keys: string[] = [];
    const { body, href } = global;
    
    Object.defineProperties(global, {
      document: {
        value: {
          createElement: function () {
            return { firstChild: { href: href } };
          },
          getElementById: function (id: string) {
            if (keys.indexOf(id) === -1) {
              const re = new RegExp(' id=[\\'"]?' + id + '[^>]*>([^<]*)');
              const match = body.match(re);
      
              keys.push(id);
              cache[id] = match === null ? match : { innerHTML: match[1] };
            }
      
            return cache[id];
          }
        }
      },
      location: { value: { reload: function () {} } }  
    })
  }(this));
`;
function evaluate(code, ctx) {
    return vm.runInNewContext(VM_ENV + code, ctx, VM_OPTIONS);
}
class Context {
    constructor(options) {
        if (!options)
            options = { body: "", hostname: "" };
        const atob = Object.setPrototypeOf(function (str) {
            try {
                return Buffer.from(str, "base64").toString("binary");
            }
            catch (e) {
                // Catch error
            }
        }, null);
        return Object.setPrototypeOf({
            body: options.body || "",
            href: "http://" + (options.hostname || "") + "/",
            atob,
        }, null);
    }
}
exports.Context = Context;
