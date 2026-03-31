/**
 * Minimal typing for optional puppeteer-core usage.
 * Consuming projects should install puppeteer-core when using Browserless.
 */
declare module "puppeteer-core" {
    interface Cookie {
        name: string;
        value: string;
        domain?: string;
        path?: string;
        expires?: number;
        httpOnly?: boolean;
        secure?: boolean;
    }

    interface Page {
        goto(url: string, opts?: object): Promise<unknown>;
        cookies(): Promise<Cookie[]>;
    }

    interface Browser {
        newPage(): Promise<Page>;
        close(): Promise<void>;
    }

    export function connect(options: { browserWSEndpoint: string }): Promise<Browser>;
    const _default: { connect: typeof connect };
    export default _default;
}

