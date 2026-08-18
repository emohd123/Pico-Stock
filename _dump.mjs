import { readFileSync, writeFileSync } from "fs";
const src = readFileSync("lib/ministry/itemDetails.js", "utf8").replace(/^export /gm, "");
const cat = readFileSync("lib/ministry/catalog.js", "utf8").replace(/^export /gm, "");
const mod = await import("data:text/javascript;base64," +
  Buffer.from(readFileSync("lib/ministry/itemDetails.js", "utf8")).toString("base64"));
const catmod = await import("data:text/javascript;base64," +
  Buffer.from(readFileSync("lib/ministry/catalog.js", "utf8")).toString("base64"));
const out = {};
for (const [no, d] of Object.entries(mod.ITEM_DETAILS)) out[no] = d;
const catalog = {};
for (const c of catmod.CATALOG) catalog[c.itemNo] = { name: c.name, description: c.description, unit: c.unit, category: c.category };
writeFileSync(process.env.TEMP + "/itemdata.json", JSON.stringify({ details: out, catalog }, null, 1), "utf8");
console.log("items:", Object.keys(out).length, "catalog:", Object.keys(catalog).length);
