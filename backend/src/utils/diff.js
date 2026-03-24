export function createDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  return { oldCount: oldLines.length, newCount: newLines.length };
}
