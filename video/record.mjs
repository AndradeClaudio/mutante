// Records the demo video from the real data, without ffmpeg: Chrome draws the scenes on a canvas
// and MediaRecorder captures it in real time.
// Usage:
//   node video/record.mjs --preview   → saves one frame per caption to video/preview/ (to check the layout)
//   node video/record.mjs             → records outreach/video/mutante-demo.mp4 and .srt
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { fixDuration } from "./fix-duration.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DESTINATION = "outreach/video/mutante-demo";

const data = {
  purchases: JSON.parse(await readFile("data/public/purchases.json", "utf8")),
  cases: JSON.parse(await readFile("data/public/cases.json", "utf8")),
  log: (await readFile("data/round-002.log", "utf8"))
    .split(/\r?\n/)
    .map((line) => /^\[(\d+) left\]\s+(\S+)\s+(\S+)\s+(.+)$/.exec(line))
    .filter(Boolean)
    .map(([, left, reviewer, caseId, outcome]) => ({ left: Number(left), reviewer, caseId, outcome: outcome.trim() })),
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 900_000,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    // The soundtrack's AudioContext must run without a click on the page.
    "--autoplay-policy=no-user-gesture-required",
  ],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error("Page error:", error.message));
  await page.goto(pathToFileURL("video/scenes.html").href);
  await page.evaluate((d) => { window.DATA = d; }, data);
  const { duration, captions, soundCues } = await page.evaluate(() => window.prepare());
  console.log(`Duration: ${duration}s, ${captions.length} captions, ${soundCues.length} sound cues, ${data.log.length} log lines`);

  if (process.argv.includes("--preview")) await savePreview(page, captions);
  else await record(page, duration, captions, soundCues);
} finally {
  await browser.close();
}

async function savePreview(page, captions) {
  await mkdir("video/preview", { recursive: true });
  const canvas = await page.$("#screen");
  for (const [i, { end }] of captions.entries()) {
    const t = end - 0.6;
    await page.evaluate((x) => window.frame(x), t);
    await canvas.screenshot({ path: `video/preview/${String(i).padStart(2, "0")}-${Math.round(t)}s.png` });
  }
  console.log(`${captions.length} frames saved to video/preview/`);
}

async function record(page, duration, captions, soundCues) {
  await mkdir("outreach/video", { recursive: true });
  const format = await page.evaluate(() =>
    ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.640028,opus", "video/webm;codecs=vp9,opus"].find((t) =>
      MediaRecorder.isTypeSupported(t)));
  if (!format) throw new Error("This Chrome cannot record video with audio.");
  const file = `${DESTINATION}.${format.startsWith("video/mp4") ? "mp4" : "webm"}`;
  await rm(file, { force: true });
  await writeFile(`${DESTINATION}.srt`, toSrt(captions));

  await page.exposeFunction("saveChunk", (base64) => appendFile(file, Buffer.from(base64, "base64")));
  console.log(`Recording in real time (${format})…`);
  await page.evaluate(
    (mimeType, total, cues) =>
      new Promise(async (done, fail) => {
        const audio = new AudioContext({ sampleRate: 48_000 });
        await audio.resume();
        const soundOutput = audio.createMediaStreamDestination();
        const stream = new MediaStream([
          ...document.getElementById("screen").captureStream(30).getVideoTracks(),
          ...soundOutput.stream.getAudioTracks(),
        ]);
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192_000 });
        let pending = Promise.resolve();
        recorder.ondataavailable = (e) => {
          pending = pending.then(async () => {
            const bytes = new Uint8Array(await e.data.arrayBuffer());
            let binary = "";
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            await window.saveChunk(btoa(binary));
          });
        };
        recorder.onstop = () => pending.then(done, fail);
        recorder.onerror = (e) => fail(e.error);
        // Picture and sound share one starting instant: the frame clock and the audio clock both begin here.
        window.scheduleSoundtrack(audio, soundOutput, audio.currentTime, cues, total);
        const start = performance.now();
        const step = () => {
          const t = (performance.now() - start) / 1000;
          window.frame(Math.min(t, total - 0.01));
          if (t < total) requestAnimationFrame(step);
          else recorder.stop();
        };
        recorder.start(1000);
        requestAnimationFrame(step);
      }),
    format,
    duration,
    soundCues,
  );
  if (file.endsWith(".mp4")) console.log(`Duration written to the header: ${(await fixDuration(file)).toFixed(1)}s`);
  console.log(`Done: ${file} and ${DESTINATION}.srt`);
}

function toSrt(captions) {
  const timestamp = (s) => {
    const ms = Math.round(s * 1000);
    const pad = (n, d = 2) => String(n).padStart(d, "0");
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return captions.map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}\n`).join("\n");
}
