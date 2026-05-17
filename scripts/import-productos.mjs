import { createClient } from "@supabase/supabase-js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import { applyImportPlan, loadExistingProducts } from "../src/lib/product-import/apply.mjs";
import { parseCsvText, validateRequiredHeaders } from "../src/lib/product-import/parse.mjs";
import { buildImportPlan } from "../src/lib/product-import/plan.mjs";
import { buildImportReport } from "../src/lib/product-import/report.mjs";
import { validateRows } from "../src/lib/product-import/validate.mjs";

const IMPORT_DIR = "data/imports/productos";
const PROCESSED_DIR = "data/imports/procesados";
const ERROR_DIR = "data/imports/errores";
const REPORT_DIR = "data/imports/reportes";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);

    if (!match) {
      continue;
    }

    values[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }

  return values;
}

function loadEnv() {
  return {
    ...loadEnvFile(".env"),
    ...loadEnvFile(".env.local"),
    ...process.env,
  };
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    file: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--file") {
      options.file = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--file=")) {
      options.file = arg.slice("--file=".length);
    }
  }

  return options;
}

function ensureDirectories() {
  for (const directory of [IMPORT_DIR, PROCESSED_DIR, ERROR_DIR, REPORT_DIR]) {
    mkdirSync(directory, { recursive: true });
  }
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function uniqueDestination(directory, filePath) {
  const name = basename(filePath);
  const extension = extname(name);
  const base = name.slice(0, name.length - extension.length);
  let destination = join(directory, name);
  let index = 1;

  while (existsSync(destination)) {
    destination = join(directory, `${base}-${timestamp()}-${index}${extension}`);
    index += 1;
  }

  return destination;
}

function reportPath(filePath) {
  const baseName = basename(filePath, extname(filePath)).replace(/[^\w.-]+/g, "-");
  return join(REPORT_DIR, `reporte-import-productos-${baseName}-${timestamp()}.json`);
}

function writeReport(filePath, report) {
  const destination = reportPath(filePath);
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return destination;
}

function listInputFiles(options) {
  if (options.file) {
    return [resolve(options.file)];
  }

  return readdirSync(IMPORT_DIR)
    .filter((file) => extname(file).toLowerCase() === ".csv")
    .map((file) => resolve(IMPORT_DIR, file));
}

function createSupabaseClient(env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local o .env."
    );
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function processFile({ filePath, supabase, tenantId, dryRun }) {
  const startedAt = new Date().toISOString();
  let plan = null;
  let applied = null;
  let status = "error";
  let fatalError = null;

  try {
    const text = readFileSync(filePath, "utf8");
    const parsed = parseCsvText(text);
    const missingHeaders = validateRequiredHeaders(parsed.headers);

    if (missingHeaders.length > 0) {
      throw new Error(`Faltan columnas obligatorias: ${missingHeaders.join(", ")}.`);
    }

    const validation = validateRows(parsed.rows);
    const existingProducts = await loadExistingProducts(supabase, tenantId);
    plan = buildImportPlan({
      sourceName: basename(filePath),
      tenantId,
      validation,
      existingProducts,
    });

    if (plan.errors.length > 0) {
      status = "con_errores";
    } else if (dryRun) {
      status = "dry_run_ok";
    } else {
      applied = await applyImportPlan({ supabase, plan });
      status = "importado";
    }
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
    status = "error";
  }

  const finishedAt = new Date().toISOString();
  const report = buildImportReport({
    file: filePath,
    dryRun,
    tenantId,
    plan,
    applied,
    status,
    startedAt,
    finishedAt,
    fatalError,
  });
  const generatedReportPath = writeReport(filePath, report);

  if (!dryRun) {
    const destination =
      status === "importado"
        ? uniqueDestination(PROCESSED_DIR, filePath)
        : uniqueDestination(ERROR_DIR, filePath);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(filePath, destination);
  }

  return {
    filePath,
    reportPath: generatedReportPath,
    status,
    inserted: applied?.inserted ?? 0,
    updated: applied?.updated ?? 0,
    errors: report.productos_con_error,
    fatalError,
  };
}

async function main() {
  ensureDirectories();

  const options = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const tenantId = env.NEXT_PUBLIC_DEFAULT_TENANT_ID;

  if (!tenantId) {
    throw new Error("Falta NEXT_PUBLIC_DEFAULT_TENANT_ID en .env.local o .env.");
  }

  const files = listInputFiles(options);

  if (files.length === 0) {
    console.log(`No hay CSV para importar en ${IMPORT_DIR}.`);
    return;
  }

  for (const file of files) {
    if (!existsSync(file)) {
      throw new Error(`No existe el archivo indicado: ${file}`);
    }
  }

  const supabase = createSupabaseClient(env);
  const results = [];

  for (const filePath of files) {
    const result = await processFile({
      filePath,
      supabase,
      tenantId,
      dryRun: options.dryRun,
    });
    results.push(result);

    console.log(
      [
        `${basename(filePath)}: ${result.status}`,
        `nuevos=${result.inserted}`,
        `actualizados=${result.updated}`,
        `errores=${result.errors}`,
        `reporte=${result.reportPath}`,
      ].join(" | ")
    );

    if (result.fatalError) {
      console.log(`Error: ${result.fatalError}`);
    }
  }

  const failed = results.filter((result) =>
    ["error", "con_errores"].includes(result.status)
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
