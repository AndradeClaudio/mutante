// Opens the recorded MP4 in Chrome and saves frames at a few instants, to check the recording without ffmpeg.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const FOLDER = "video/check-frames";
await mkdir(FOLDER, { recursive: true });
// A page loaded with goto (not setContent) is allowed to read the local video file.
await writeFile(`${FOLDER}/player.html`, `<video id="v" src="../../outreach/video/mutante-demo.mp4" muted preload="auto" style="width:1920px;height:1080px"></video>`);
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  defaultViewport: { width: 1920, height: 1080 },
  protocolTimeout: 60_000,
});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(`${FOLDER}/player.html`).href);
  const info = await page.evaluate(() => new Promise((resolve, reject) => {
    const v = document.getElementById("v");
    v.onerror = () => reject(new Error(`media error ${v.error?.code}`));
    const ready = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    if (v.readyState >= 1) ready(); else v.onloadedmetadata = ready;
  }));
  console.log(info);
  console.log("Loudness (RMS) by second, to confirm the soundtrack and where it peaks:");
  // Chrome does not let a page fetch a local file, so the bytes are handed over from Node.
  const mp4Base64 = (await readFile("outreach/video/mutante-demo.mp4")).toString("base64");
  console.log(await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    const sound = await new AudioContext().decodeAudioData(bytes);
    const samples = sound.getChannelData(0);
    const perSecond = [];
    for (let s = 0; s * sound.sampleRate < samples.length; s++) {
      let sum = 0, n = 0;
      for (let i = s * sound.sampleRate; i < Math.min((s + 1) * sound.sampleRate, samples.length); i++, n++) sum += samples[i] ** 2;
      perSecond.push(Math.sqrt(sum / n));
    }
    const loudest = perSecond.indexOf(Math.max(...perSecond));
    return { seconds: perSecond.length, loudestSecond: loudest, rms: perSecond.map((v) => v.toFixed(3)).join(" ") };
  }, mp4Base64));
  for (const t of [5, 20, 80, 140, 170, 225]) {
    await page.evaluate((x) => new Promise((resolve) => { const v = document.getElementById("v"); v.onseeked = () => resolve(); v.currentTime = x; }), t);
    await page.screenshot({ path: `${FOLDER}/${t}s.png` });
  }
  console.log(`frames saved to ${FOLDER}`);
} finally {
  await browser.close();
}
