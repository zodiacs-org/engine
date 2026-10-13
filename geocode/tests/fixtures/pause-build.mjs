// Pause after a real staged shard write so the parent can test process death.
import promises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";

const writeFile = promises.writeFile;
promises.writeFile = async (file, ...args) => {
  await writeFile(file, ...args);
  if (basename(String(file)) === "places-000000.json") {
    process.send({ stagedShard: String(file) });
    setInterval(() => {}, 1000);
    await new Promise(() => {});
  }
};
syncBuiltinESMExports();
