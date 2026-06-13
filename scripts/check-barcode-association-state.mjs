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

const { getBarcodeAssociationState } = context.exports;

if (typeof getBarcodeAssociationState !== "function") {
  throw new Error("getBarcodeAssociationState no esta disponible.");
}

const defaultUnitWithoutBarcode = {
  active: true,
  barcode: "",
  isDefault: true,
  name: "Unidad",
};

const cases = [
  {
    name: "default unit without barcode is empty",
    product: {
      sku: "17458",
      barcode: null,
      saleUnits: [defaultUnitWithoutBarcode],
    },
    expected: {
      canAssign: true,
      status: "empty",
      statusLabel: "Sin codigo de barras cargado",
    },
  },
  {
    name: "product barcode equal to sku is inherited",
    product: {
      sku: "17458",
      barcode: "17458",
      saleUnits: [defaultUnitWithoutBarcode],
    },
    expected: {
      canAssign: true,
      primaryBarcode: "17458",
      status: "inherited_product_barcode",
      statusLabel: "Codigo interno heredado",
    },
  },
  {
    name: "real product barcode blocks assignment",
    product: {
      sku: "17458",
      barcode: "7791234567890",
      saleUnits: [defaultUnitWithoutBarcode],
    },
    expected: {
      canAssign: false,
      primaryBarcode: "7791234567890",
      status: "product_barcode",
      statusLabel: "Codigo de barras cargado: 7791234567890",
    },
  },
  {
    name: "real sale unit barcode is preserved while assignment remains available",
    product: {
      sku: "17458",
      barcode: null,
      saleUnits: [
        defaultUnitWithoutBarcode,
        {
          active: true,
          barcode: "7791234567890",
          isDefault: false,
          name: "Caja",
        },
      ],
    },
    expected: {
      buttonLabel: "Asociar codigo de barras principal",
      canAssign: true,
      primaryBarcode: "7791234567890",
      saleUnitName: "Caja",
      status: "sale_unit_barcode",
      statusLabel: "La presentacion Caja tiene codigo: 7791234567890",
    },
  },
  {
    name: "inactive sale unit barcode is ignored",
    product: {
      sku: "17458",
      barcode: null,
      saleUnits: [
        defaultUnitWithoutBarcode,
        {
          active: false,
          barcode: "7791234567890",
          isDefault: false,
          name: "Caja",
        },
      ],
    },
    expected: {
      canAssign: true,
      status: "empty",
      statusLabel: "Sin codigo de barras cargado",
    },
  },
];

for (const testCase of cases) {
  const actual = getBarcodeAssociationState(testCase.product);

  for (const [key, expectedValue] of Object.entries(testCase.expected)) {
    if (actual[key] !== expectedValue) {
      throw new Error(
        `${testCase.name}: ${key} => ${JSON.stringify(
          actual[key]
        )}; esperado ${JSON.stringify(expectedValue)}`
      );
    }
  }
}

console.log("getBarcodeAssociationState: OK");
