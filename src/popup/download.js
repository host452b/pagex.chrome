export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking right after click can cancel large downloads before Chrome has
  // read the blob. The popup frees it anyway when it closes.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
