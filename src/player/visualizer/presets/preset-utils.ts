/** Average of `data[start..end)`, `start`/`end` given as fractions of the array's length — shared by the orchestrator's bass/mid/treble bands and any preset that needs a different slice of the spectrum. */
export function bandAverage(
    data: Uint8Array<ArrayBuffer>,
    startPct: number,
    endPct: number,
): number {
    const start = Math.floor(data.length * startPct);
    const end = Math.floor(data.length * endPct);
    if (end <= start) return 0;
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] ?? 0;
    return sum / (end - start);
}
