import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";

const ACADEMIC_NOTICE =
  "Este documento tiene fines informativos, técnicos y académicos. Para su uso comercial definitivo deberá ser revisado y validado por un profesional del derecho conforme la normativa aplicable.";

type MarkdownBlock =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[] };

type LegalDocumentProps = {
  fileName: "terminos-y-condiciones.md" | "politica-de-privacidad.md";
  updatedAtFallback: string;
};

function readLegalMarkdown(fileName: LegalDocumentProps["fileName"]) {
  return readFileSync(path.join(process.cwd(), "docs", fileName), "utf8");
}

function cleanLine(line: string) {
  return line.trim().replace(/\s{2,}$/g, "");
}

function parseMarkdown(markdown: string) {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraph.join(" "),
    });
    paragraph = [];
  }

  function flushList() {
    if (list.length === 0) {
      return;
    }

    blocks.push({
      type: "list",
      items: list,
    });
    list = [];
  }

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h1", text: line.replace(/^#\s+/, "") });
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.replace(/^##\s+/, "") });
      continue;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: line.replace(/^>\s+/, "") });
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.replace(/^-\s+/, ""));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function parseInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}

function extractTitle(blocks: MarkdownBlock[]) {
  return blocks.find((block) => block.type === "h1")?.text ?? "Documento legal";
}

function extractUpdatedAt(markdown: string, fallback: string) {
  const dateLine = markdown
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes("fecha de"));

  const value = dateLine?.replace(/\*\*/g, "").split(":").slice(1).join(":").trim();

  return value || fallback;
}

function LegalBlocks({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <div className="grid gap-4">
      {blocks.map((block, index) => {
        if (block.type === "h1") {
          return null;
        }

        if (block.type === "h2") {
          return (
            <h2
              key={`${block.type}-${index}`}
              className="mt-6 scroll-m-6 border-t border-border pt-6 text-xl font-bold text-primary"
            >
              {block.text}
            </h2>
          );
        }

        if (block.type === "quote") {
          return (
            <aside
              key={`${block.type}-${index}`}
              className="rounded-lg border border-accent/40 bg-secondary p-4 text-sm font-medium leading-6 text-foreground"
            >
              {parseInline(block.text)}
            </aside>
          );
        }

        if (block.type === "list") {
          return (
            <ul
              key={`${block.type}-${index}`}
              className="grid list-disc gap-2 pl-6 text-base leading-7 text-foreground"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{parseInline(item)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={`${block.type}-${index}`}
            className="text-base leading-7 text-foreground"
          >
            {parseInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

export function LegalDocument({
  fileName,
  updatedAtFallback,
}: LegalDocumentProps) {
  const markdown = readLegalMarkdown(fileName);
  const blocks = parseMarkdown(markdown);
  const title = extractTitle(blocks);
  const updatedAt = extractUpdatedAt(markdown, updatedAtFallback);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-secondary"
          >
            <BrandLogo size="small" showText={false} imageClassName="size-7" />
            {ferreteriaGuemesBrand.brandName}
          </Link>
          <Button asChild variant="outline" className="h-10 gap-2 px-4 text-sm">
            <Link href="/login">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Volver al login
            </Link>
          </Button>
        </div>

        <article className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
          <header className="grid gap-3 border-b border-border pb-6">
            <p className="text-sm font-semibold uppercase tracking-normal text-muted-foreground">
              Base legal de uso
            </p>
            <h1 className="text-3xl font-bold leading-tight text-primary sm:text-4xl">
              {title}
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              Fecha de ultima actualizacion: {updatedAt}
            </p>
          </header>

          <section className="mt-6 rounded-lg border border-accent/40 bg-secondary p-4 text-sm font-semibold leading-6 text-foreground">
            {ACADEMIC_NOTICE}
          </section>

          <section className="mt-6">
            <LegalBlocks blocks={blocks} />
          </section>
        </article>
      </div>
    </main>
  );
}
