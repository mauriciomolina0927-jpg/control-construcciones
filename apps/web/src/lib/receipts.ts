import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectReceiptType, MAX_RECEIPT_BYTES, type ReceiptType } from "@/lib/expenses";

export type CheckedReceipt = { bytes: Uint8Array; type: ReceiptType; sha256: string };

/** Reads an uploaded file and checks it is a photo or PDF within the size limit. */
export async function checkReceipt(file: FormDataEntryValue | null): Promise<CheckedReceipt | { error: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_RECEIPT_BYTES) return { error: "La foto o el PDF pesa más de 4 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectReceiptType(bytes);
  if (!type) return { error: "El soporte debe ser una foto o un PDF." };
  return { bytes, type, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/**
 * Uploads a checked receipt to "<organization>/<house>/<file>" and links it to its record.
 * The database marks the expense as supported. Returns false if anything failed.
 */
export async function storeReceipt(
  supabase: SupabaseClient,
  owner: { organizationId: string; houseId: string; type: "expense" | "sale_payment"; id: string },
  receipt: CheckedReceipt,
): Promise<boolean> {
  const path = `${owner.organizationId}/${owner.houseId}/${randomUUID()}.${receipt.type.extension}`;
  const upload = await supabase.storage
    .from("receipts")
    .upload(path, receipt.bytes, { contentType: receipt.type.mime, upsert: false });
  if (upload.error) return false;

  const { error } = await supabase.from("attachments").insert({
    organization_id: owner.organizationId,
    house_id: owner.houseId,
    owner_type: owner.type,
    owner_id: owner.id,
    storage_path: path,
    mime_type: receipt.type.mime,
    size_bytes: receipt.bytes.byteLength,
    sha256: receipt.sha256,
  });
  return !error;
}
