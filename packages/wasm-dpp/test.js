const { default: load_dpp } = require('./dist');

async function main() {
    console.log("Starting test");

    let Dpp = await load_dpp();

    console.dir(Dpp);

    let { Identifier, Transaction } = Dpp;

    let buf = Uint8Array.from(Buffer.from('f1'.repeat(32), 'hex'));
    let id = new Identifier(buf);

    console.log(id.toString());

    try {
        let id2 = new Identifier(Uint8Array.from([0,0]));
    } catch (e) {
        console.error(e);
    }

    let tx = new Transaction();

    console.log("tx version: ", tx.version());

}

main().catch(console.error);
