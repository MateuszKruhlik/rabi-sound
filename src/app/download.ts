export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  downloadBlob(new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName);
}
