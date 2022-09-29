import * as dpp_module from "../wasm/wasm_dpp";
// import { inspect } from 'util';

export default function (dppModule: typeof dpp_module) {
    const { Identifier } = dppModule;

    //@ts-ignore
    Object.setPrototypeOf(Identifier.prototype, Buffer.prototype);
    // Object.defineProperty(Identifier.prototype, 'length', { get() { return this.len(); } });

    Identifier.prototype.valueOf = function() {
        return Buffer.from(this.inner())
    }

    // @ts-ignore
    Identifier.prototype.encodeCBOR = function encodeCBOR(encoder) {
        // @ts-ignore
        encoder.pushAny(this.valueOf());

        return true;
    };

    // @ts-ignore
    Identifier.prototype.inspect = function(...args) {
        return this.valueOf().inspect(...args);
    }

    // THIS MAKES BUFFERS PRINTABLE IN NODE.JS, BUT FOR THIS TO WORK
    // target: node has to be specified and utils have to be included __without__ using
    // polyfills.

    // console.log("custom:", inspect.custom);
    // //@ts-ignore
    // Identifier.prototype[inspect.custom] = Identifier.prototype.inspect;
}