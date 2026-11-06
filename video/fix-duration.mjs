// Chrome's MediaRecorder writes a fragmented MP4 with duration 0 in the header, so some players show
// a wrong time bar. This writes the real duration (taken from the last fragment) into `mvhd` and adds
// `mehd`, where the standard keeps the duration of a fragmented MP4. Running it twice changes nothing.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function fixDuration(path) {
  const mp4 = await readFile(path);
  const moov = findBox(mp4, 0, mp4.length, "moov");
  const mvhd = findBox(mp4, moov.start + 8, moov.end, "mvhd");
  const mvex = findBox(mp4, moov.start + 8, moov.end, "mvex");
  if (!mvhd || !mvex) throw new Error("MP4 without mvhd/mvex: not the expected fragmented format.");
  if (findBox(mp4, mvex.start + 8, mvex.end, "mehd")) return readDuration(mp4, mvhd);

  const version1 = mp4[mvhd.start + 8] === 1;
  const movieTimescale = mp4.readUInt32BE(mvhd.start + (version1 ? 28 : 20));
  const seconds = durationFromFragments(mp4);
  const duration = Math.round(seconds * movieTimescale);
  if (version1) mp4.writeBigUInt64BE(BigInt(duration), mvhd.start + 32);
  else mp4.writeUInt32BE(duration, mvhd.start + 24);

  const mehd = Buffer.alloc(16);
  mehd.writeUInt32BE(16, 0);
  mehd.write("mehd", 4, "ascii");
  mehd.writeUInt32BE(duration, 12);
  mp4.writeUInt32BE(mvex.end - mvex.start + 16, mvex.start);
  mp4.writeUInt32BE(moov.end - moov.start + 16, moov.start);
  await writeFile(path, Buffer.concat([mp4.subarray(0, mvex.start + 8), mehd, mp4.subarray(mvex.start + 8)]));
  return seconds;
}

/** End of the longest track, in seconds: each fragment's start (tfdt) plus its sample durations (trun). */
function durationFromFragments(mp4) {
  const timescaleByTrack = trackTimescales(mp4);
  const endByTrack = new Map();
  for (const moof of boxes(mp4, 0, mp4.length, "moof")) {
    for (const traf of boxes(mp4, moof.start + 8, moof.end, "traf")) {
      const tfhd = boxes(mp4, traf.start + 8, traf.end, "tfhd")[0];
      const tfdt = boxes(mp4, traf.start + 8, traf.end, "tfdt")[0];
      const trackId = mp4.readUInt32BE(tfhd.start + 12);
      const fragmentStart = mp4[tfdt.start + 8] ? Number(mp4.readBigUInt64BE(tfdt.start + 12)) : mp4.readUInt32BE(tfdt.start + 12);
      let length = 0;
      for (const trun of boxes(mp4, traf.start + 8, traf.end, "trun")) length += runDuration(mp4, trun, defaultSampleDuration(mp4, tfhd));
      endByTrack.set(trackId, Math.max(endByTrack.get(trackId) ?? 0, fragmentStart + length));
    }
  }
  return Math.max(...[...endByTrack].map(([trackId, end]) => end / timescaleByTrack.get(trackId)));
}

function trackTimescales(mp4) {
  const moov = findBox(mp4, 0, mp4.length, "moov");
  const result = new Map();
  for (const trak of boxes(mp4, moov.start + 8, moov.end, "trak")) {
    const tkhd = findBox(mp4, trak.start + 8, trak.end, "tkhd");
    const mdia = findBox(mp4, trak.start + 8, trak.end, "mdia");
    const mdhd = findBox(mp4, mdia.start + 8, mdia.end, "mdhd");
    const trackId = mp4.readUInt32BE(tkhd.start + (mp4[tkhd.start + 8] ? 28 : 20));
    result.set(trackId, mp4.readUInt32BE(mdhd.start + (mp4[mdhd.start + 8] ? 28 : 20)));
  }
  return result;
}

function defaultSampleDuration(mp4, tfhd) {
  const flags = mp4.readUIntBE(tfhd.start + 9, 3);
  if (!(flags & 0x08)) return 0;
  return mp4.readUInt32BE(tfhd.start + 16 + (flags & 0x01 ? 8 : 0) + (flags & 0x02 ? 4 : 0));
}

function runDuration(mp4, trun, defaultDuration) {
  const flags = mp4.readUIntBE(trun.start + 9, 3);
  const samples = mp4.readUInt32BE(trun.start + 12);
  let o = trun.start + 16 + (flags & 0x01 ? 4 : 0) + (flags & 0x04 ? 4 : 0);
  let total = 0;
  for (let i = 0; i < samples; i++) {
    if (flags & 0x100) { total += mp4.readUInt32BE(o); o += 4; } else total += defaultDuration;
    if (flags & 0x200) o += 4;
    if (flags & 0x400) o += 4;
    if (flags & 0x800) o += 4;
  }
  return total;
}

function boxes(mp4, start, end, type) {
  const found = [];
  for (let p = start; p + 8 <= end; ) {
    const size = mp4.readUInt32BE(p);
    if (size < 8) break;
    if (mp4.toString("ascii", p + 4, p + 8) === type) found.push({ start: p, end: p + size });
    p += size;
  }
  return found;
}

function findBox(mp4, start, end, type) {
  for (let p = start; p + 8 <= end; ) {
    const size = mp4.readUInt32BE(p);
    if (size < 8) return null;
    if (mp4.toString("ascii", p + 4, p + 8) === type) return { start: p, end: p + size };
    p += size;
  }
  return null;
}

function readDuration(mp4, mvhd) {
  if (mp4[mvhd.start + 8] === 1) return Number(mp4.readBigUInt64BE(mvhd.start + 32)) / mp4.readUInt32BE(mvhd.start + 28);
  return mp4.readUInt32BE(mvhd.start + 24) / mp4.readUInt32BE(mvhd.start + 20);
}

// Also usable on its own: node video/fix-duration.mjs <file.mp4>
const runDirectly = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (runDirectly && process.argv[2]) console.log(`Duration written to the header: ${(await fixDuration(process.argv[2])).toFixed(1)}s`);
