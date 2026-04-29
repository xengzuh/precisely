"use client"

// Camera access requires HTTPS in production.
// localhost is the only HTTP exception browsers allow.

import { useEffect, useRef, useState } from "react"
import { BrowserMultiFormatReader } from "@zxing/browser"
import type { IScannerControls } from "@zxing/browser"
import { Button } from "@/components/ui/button"

type Props = {
  onScan: (result: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    // Guard: mediaDevices is undefined on HTTP (non-localhost) or very old browsers
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("Camera not available. Please use HTTPS or a modern browser.")
      setScanning(false)
      return
    }

    const videoEl = videoRef.current
    if (!videoEl) return

    const reader = new BrowserMultiFormatReader()
    let mounted = true

    reader
      .decodeFromVideoDevice(
        undefined, // use default/back camera
        videoEl,
        (result, _err, controls) => {
          if (!mounted) return
          if (result) {
            controls.stop()
            controlsRef.current = null
            setScanning(false)
            onScan(result.getText())
          }
          // _err is NotFoundException between frames — not fatal, ignore
        }
      )
      .then((controls) => {
        if (!mounted) {
          controls.stop()
          return
        }
        controlsRef.current = controls
      })
      .catch((err: Error) => {
        if (!mounted) return
        if (err.name === "NotAllowedError") {
          setError(
            "Camera access denied. Please allow camera access in your browser settings."
          )
        } else {
          setError("Failed to access camera. Please try again.")
        }
        setScanning(false)
      })

    return () => {
      mounted = false
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [onScan])

  function handleCancel() {
    controlsRef.current?.stop()
    controlsRef.current = null
    onClose()
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {error ? (
        <div className="w-full rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive text-center">
          {error}
        </div>
      ) : (
        <div className="relative w-full overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            className="w-full aspect-[4/3] object-cover"
            playsInline
            muted
          />
          {/* Red horizontal scanning guide line */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4/5 h-px bg-red-500 shadow-[0_0_6px_3px_rgba(239,68,68,0.5)]" />
          </div>
        </div>
      )}

      {scanning && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          Scanning…
        </div>
      )}

      <Button
        variant="outline"
        type="button"
        className="w-full"
        onClick={handleCancel}
      >
        Cancel
      </Button>
    </div>
  )
}
