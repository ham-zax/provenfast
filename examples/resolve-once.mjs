// Worked example for the provenfast skill: the same lookup resolved three
// times per item (slow) vs once (fast). Output is identical; work is not.
//
//   node resolve-once.mjs slow|fast [items] [passes]
//
// stdout: the checksum (must match between modes).
// stderr: in-process loop time, so startup and setup are excluded.
const mode = process.argv[2] ?? 'slow';
const items = Number(process.argv[3] ?? 20000);
const passes = Number(process.argv[4] ?? 1);

const ids = Array.from({ length: items }, (_, i) => `m${i}`);
const byId = new Map(ids.map((id, i) => [id, { id, parent: i ? `m${i - 1}` : null }]));
function resolve(id) {
    return byId.get(id);
}

const start = performance.now();
let total = 0;
for (let pass = 0; pass < passes; pass++) {
    for (const id of ids) {
        if (mode === 'slow') {
            if (resolve(id) && resolve(id).parent) total += resolve(id).parent.length;
        } else {
            const message = resolve(id);
            if (message && message.parent) total += message.parent.length;
        }
    }
}
console.error(`loop ${(performance.now() - start).toFixed(1)} ms`);
console.log(total);
