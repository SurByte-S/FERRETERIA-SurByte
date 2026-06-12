import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = join(cwd(), "src", "lib", "product-code.ts");
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});
const context = {
  exports: {},
  module: { exports: {} },
};

vm.createContext(context);
vm.runInContext(compiled.outputText, context, { filename: sourcePath });

const { normalizeProductCode } = context.exports;

if (typeof normalizeProductCode !== "function") {
  throw new Error("normalizeProductCode no esta disponible.");
}

const cases = [
  ["000123", "000123"],
  [" 000123 ", "000123"],
  ["00\u200B0123", "000123"],
  ["\uFEFFabc-12\u2060", "ABC-12"],
];

for (const [input, expected] of cases) {
  const actual = normalizeProductCode(input);

  if (actual !== expected) {
    throw new Error(
      `normalizeProductCode(${JSON.stringify(input)}) => ${JSON.stringify(
        actual
      )}; esperado ${JSON.stringify(expected)}`
    );
  }
}

console.log("normalizeProductCode: OK");
