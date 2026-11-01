"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Upload } from "lucide-react";
import { importProductsAction, type ImportRowResult } from "@/lib/actions/product-import";
import { csvToObjects, downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import { IMPORT_COLUMNS, TEMPLATE_ROWS, type ImportRow } from "@/lib/product-columns";

const CHUNK = 200;

// Spreadsheet import for products (docs/retail-plan step 2.5): pick a CSV, check the preview,
// import. Rows go to the server in chunks of 200 with a progress bar; the server re-checks every
// row and reports added / updated / skipped (with why) — skipped rows download as a CSV to fix.
export function ImportClient({ productsWord, manageLabel }: { productsWord: string; manageLabel: string }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [createCategories, setCreateCategories] = useState(true);
  const [updateStock, setUpdateStock] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setResults(null);
    setError(null);
    setFileName(file.name);
    const objects = csvToObjects(parseCsv(await file.text()));
    if (objects.length === 0) {
      setRows([]);
      setError("That file has no rows under the header.");
      return;
    }
    const known = new Set<string>(IMPORT_COLUMNS);
    setUnknownColumns(Object.keys(objects[0]).filter((k) => !known.has(k)));
    setRows(objects as ImportRow[]);
  }

  async function runImport() {
    setResults(null);
    setError(null);
    const all: ImportRowResult[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      setProgress(i / rows.length);
      const res = await importProductsAction(rows.slice(i, i + CHUNK), i + 2, { createCategories, updateStock }).catch(() => ({
        results: [] as ImportRowResult[],
        error: "Lost connection while importing — the rows before this point were saved. Try the file again; matching rows will update, not duplicate.",
      }));
      all.push(...res.results);
      if (res.error) {
        setError(res.error);
        break;
      }
    }
    setProgress(null);
    setResults(all);
  }

  const counts = results && {
    added: results.filter((r) => r.status === "added").length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped"),
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href="/manage-dishes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> {manageLabel}
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Import {productsWord.toLowerCase()} from a spreadsheet</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">
        Save your spreadsheet as CSV with these column names in the first row. Products that already exist are matched by SKU, then
        barcode, then name — and updated instead of added twice. Only <b>name</b>, <b>category</b> and <b>price</b> are needed.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => downloadCsv("products-template.csv", toCsv([...IMPORT_COLUMNS], TEMPLATE_ROWS))}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <Download className="h-4 w-4" /> Download template
        </button>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
          <Upload className="h-4 w-4" /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>

      <details className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <summary className="cursor-pointer font-medium text-neutral-800">What goes in each column</summary>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          <li><b>sku</b> — your product code (optional)</li>
          <li><b>barcode</b>, <b>barcode2</b> — EAN/UPC on the pack (checked)</li>
          <li><b>name</b>, <b>category</b> — category is created if missing (tick below)</li>
          <li><b>sell_by</b> — unit, weight, volume or length</li>
          <li><b>unit</b> — each/pack/box/case, kg/g, l/ml, m/cm</li>
          <li><b>price</b> — per unit (per kg for weight)</li>
          <li><b>cost_price</b> — what you pay, for margin</li>
          <li><b>vat</b> — leave blank for the category&rsquo;s rate</li>
          <li><b>min_age</b> — 16, 18, 21 or 25 for restricted items</li>
          <li><b>track_stock</b> — yes / no</li>
          <li><b>stock</b>, <b>low_stock</b> — how many now, and the low level</li>
          <li><b>brand</b>, <b>description</b>, <b>image_url</b> — optional</li>
        </ul>
      </details>

      {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

      {rows.length > 0 && !results && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2 font-medium text-neutral-800">
              <FileSpreadsheet className="h-4 w-4 text-neutral-400" /> {fileName} — {rows.length} rows
            </span>
            <label className="flex items-center gap-2 text-neutral-600">
              <input type="checkbox" checked={createCategories} onChange={(e) => setCreateCategories(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              Create missing categories
            </label>
            <label className="flex items-center gap-2 text-neutral-600">
              <input type="checkbox" checked={updateStock} onChange={(e) => setUpdateStock(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              Set stock of existing products to the file&rsquo;s numbers
            </label>
          </div>
          {unknownColumns.length > 0 && (
            <p className="mb-3 text-xs text-amber-700">Ignored columns (not recognised): {unknownColumns.join(", ")}</p>
          )}
          <div className="max-h-[420px] overflow-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  {["sku", "barcode", "name", "category", "sell_by", "unit", "price", "stock"].map((c) => (
                    <th key={c} className="px-3 py-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-neutral-400">{i + 2}</td>
                    {(["sku", "barcode", "name", "category", "sell_by", "unit", "price", "stock"] as const).map((c) => (
                      <td key={c} className="max-w-[200px] truncate px-3 py-1.5 text-neutral-700">
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 && <p className="mt-1 text-xs text-neutral-400">Showing the first 100 of {rows.length} rows.</p>}
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={runImport}
              disabled={progress !== null}
              className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
            >
              {progress !== null ? `Importing… ${Math.round(progress * 100)}%` : `Import ${rows.length} rows`}
            </button>
            {progress !== null && (
              <div className="h-2 w-64 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-[var(--brand)] transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {counts && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold text-neutral-900">Import finished</h2>
          <p className="mt-1 text-sm text-neutral-600">
            <b className="text-emerald-700">{counts.added} added</b> · <b>{counts.updated} updated</b> ·{" "}
            <b className={counts.skipped.length ? "text-rose-700" : ""}>{counts.skipped.length} skipped</b>
          </p>
          {counts.skipped.length > 0 && (
            <>
              <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm">
                {counts.skipped.map((r) => (
                  <li key={r.row} className="text-neutral-700">
                    Row {r.row} · {r.name}: <span className="text-rose-700">{r.message}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    "skipped-rows.csv",
                    toCsv(["row", "name", "problem"], counts.skipped.map((r) => [r.row, r.name, r.message ?? ""]))
                  )
                }
                className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <Download className="h-4 w-4" /> Download skipped rows
              </button>
            </>
          )}
          <Link href="/manage-dishes" className="mt-4 inline-block text-sm font-semibold text-[var(--brand)] hover:underline">
            Back to {manageLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
