"use client"

import { useRef, useState } from "react"
import { Upload, FileText, X } from "lucide-react"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  onParsed: (headers: string[], rows: Record<string, string>[]) => void
  onCancel: () => void
}

export function CSVImporter({ onParsed, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewHeaders, setPreviewHeaders] = useState<string[] | null>(null)
  const [previewRows, setPreviewRows] = useState<Record<string, string>[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  function parseFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setParseError("Please upload a .csv file")
      return
    }
    setFileName(file.name)
    setParseError(null)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        const headers = (result.meta.fields ?? []).filter(Boolean) as string[]
        if (headers.length === 0) {
          setParseError("The CSV has no header row or is empty")
          return
        }
        const rows = result.data as Record<string, string>[]
        setPreviewHeaders(headers)
        setPreviewRows(rows)
      },
      error(err) {
        setParseError(`Failed to parse CSV: ${err.message}`)
      },
    })
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    parseFile(files[0])
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  function resetFile() {
    setFileName(null)
    setPreviewHeaders(null)
    setPreviewRows(null)
    setParseError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-colors cursor-pointer",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
          {fileName ? (
            <>
              <FileText className="size-10 text-primary" />
              <div>
                <p className="font-medium text-sm">{fileName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {previewRows ? `${previewRows.length} rows detected` : "Parsing…"}
                </p>
              </div>
            </>
          ) : (
            <>
              <Upload className="size-10 text-muted-foreground/50" />
              <div>
                <p className="font-medium text-sm">
                  {dragOver ? "Drop your CSV here" : "Drag & drop your CSV here"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  or click to browse files
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {parseError && (
        <p className="text-sm text-destructive">{parseError}</p>
      )}

      {/* Preview table */}
      {previewHeaders && previewRows && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Preview (first 5 rows)</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); resetFile() }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
              Change file
            </button>
          </div>
          <div className="rounded-lg border overflow-x-auto text-xs">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {previewHeaders.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {previewHeaders.map((h) => (
                      <td key={h} className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-32 truncate">
                        {row[h] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" type="button" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={!previewHeaders || !previewRows}
          onClick={() => {
            if (previewHeaders && previewRows) onParsed(previewHeaders, previewRows)
          }}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
