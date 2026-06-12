import { rmSync } from "node:fs";
import { resolve } from "node:path";

const devTypesPath = resolve(process.cwd(), ".next", "dev", "types");

rmSync(devTypesPath, { force: true, recursive: true });
