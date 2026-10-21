"use client";

import { useRef, useState } from "react";
import { MAX_RECEIPT_BYTES } from "@/lib/expenses";

const MAX_SIDE = 1600;

/** Shrinks a phone photo to a readable JPEG of a few hundred KB, so it uploads on weak signal. */
async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // The browser cannot read this format (for example HEIC outside Safari): send the original.
    return file;
  }
}

export function ReceiptInput({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function onChange() {
    const el = input.current!;
    const original = el.files?.[0];
    setPreview(null);
    setNote(null);
    if (!original) return;

    onBusyChange?.(true);
    const file = await compress(original);
    onBusyChange?.(false);

    if (file.size > MAX_RECEIPT_BYTES) {
      el.value = "";
      setNote("Pesa más de 4 MB. Toma la foto de nuevo o envía un PDF más liviano.");
      return;
    }
    if (file !== original) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      el.files = transfer.files;
    }
    if (file.type.startsWith("image/")) setPreview(URL.createObjectURL(file));
    setNote(`${file.type === "application/pdf" ? "PDF" : "Foto"} lista (${Math.max(1, Math.round(file.size / 1024))} KB)`);
  }

  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-black/20 px-4 py-4 text-base font-medium text-brand dark:border-white/25">
        {preview ? "Cambiar foto" : "Tomar foto del soporte"}
        <input
          ref={input}
          type="file"
          name="receipt"
          accept="image/*,application/pdf"
          capture="environment"
          onChange={onChange}
          className="sr-only"
        />
      </label>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not an optimizable asset
        <img src={preview} alt="Soporte" className="max-h-56 w-full rounded-xl object-contain" />
      )}
      {note && <p className="text-sm text-foreground/70">{note}</p>}
    </div>
  );
}
