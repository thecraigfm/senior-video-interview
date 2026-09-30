"use strict";

const QUESTIONS = [
  "Tell me about yourself.",
  "What is your greatest strength?",
  "What is your biggest weakness?",
  "Why are you interested in this position?",
  "Tell me about a successful project you worked on and your role in it.",
  "Tell me about a time you faced a challenge or failure.",
  "Tell me about a time you disagreed with your manager or team.",
  "What’s something you’ve taught yourself recently?",
  "Where do you see yourself in five years?",
  "Do you have any questions for us?"
];

const MAX_SECONDS = 5 * 60;
const el = (id) => document.getElementById(id);
const ui = {
  interviewCard: el("interviewCard"), finishCard: el("finishCard"), questionNumber: el("questionNumber"),
  questionText: el("questionText"), progressText: el("progressText"), progressBar: el("progressBar"), savedCount: el("savedCount"),
  liveVideo: el("liveVideo"), playbackVideo: el("playbackVideo"), cameraMessage: el("cameraMessage"),
  recordingMessage: el("recordingMessage"), timer: el("timer"), status: el("statusMessage"), downloadStatus: el("downloadStatus"),
  enable: el("enableButton"), start: el("startButton"), stop: el("stopButton"), rerecord: el("rerecordButton"),
  keep: el("keepButton"), download: el("downloadButton"), review: el("reviewButton")
};

let current = 0;
let stream;
let recorder;
let chunks = [];
let currentBlob;
let currentUrl;
let timerId;
let startedAt;
let answers = new Map();
let fileExtension = "webm";
let hasDownloaded = false;

function formatTime(totalSeconds) {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function setStatus(message) { ui.status.textContent = message; }

function updateQuestion() {
  const answer = answers.get(current);
  ui.questionNumber.textContent = `Question ${current + 1}`;
  ui.questionText.textContent = QUESTIONS[current];
  ui.progressText.textContent = `Question ${current + 1} of ${QUESTIONS.length}`;
  ui.progressBar.style.width = `${((current + 1) / QUESTIONS.length) * 100}%`;
  ui.savedCount.textContent = `${answers.size} saved`;
  ui.timer.textContent = "0:00";
  showPlayback(answer?.blob);
  ui.keep.disabled = !currentBlob && !answer;
  ui.rerecord.disabled = !currentBlob && !answer;
  ui.start.disabled = !stream;
  ui.stop.disabled = true;
  setStatus(answer ? "This answer has been saved. You may re-record it if you prefer." : "Ready when you are.");
}

function showPlayback(blob) {
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = undefined;
  currentBlob = blob || undefined;
  if (blob) {
    currentUrl = URL.createObjectURL(blob);
    ui.playbackVideo.src = currentUrl;
    ui.recordingMessage.textContent = "Watch your answer, then keep it or re-record.";
  } else {
    ui.playbackVideo.removeAttribute("src");
    ui.playbackVideo.load();
    ui.recordingMessage.textContent = "Your recorded answer will appear here.";
  }
}

function chooseMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  const mimeType = candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type));
  fileExtension = mimeType?.includes("mp4") ? "mp4" : "webm";
  return mimeType;
}

async function enableCamera() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("This browser does not support in-browser video recording. Please use a current version of Chrome, Edge, Firefox, or Safari.");
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
    ui.liveVideo.srcObject = stream;
    ui.enable.textContent = "Camera enabled";
    ui.enable.disabled = true;
    ui.start.disabled = false;
    ui.cameraMessage.textContent = "Camera and microphone are ready.";
    setStatus("Camera ready. Start recording when you are prepared.");
  } catch (error) {
    setStatus("Camera or microphone access was not granted. Check your browser permissions and try again.");
  }
}

function updateTimer() {
  const elapsed = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
  ui.timer.textContent = formatTime(elapsed);
  if (elapsed >= MAX_SECONDS && recorder?.state === "recording") stopRecording(true);
}

function startRecording() {
  if (!stream) return;
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = undefined;
  currentBlob = undefined;
  ui.playbackVideo.removeAttribute("src");
  ui.playbackVideo.load();
  chunks = [];
  const mimeType = chooseMimeType();
  const options = mimeType ? { mimeType, videoBitsPerSecond: 1100000, audioBitsPerSecond: 64000 } : undefined;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch (_) {
    recorder = new MediaRecorder(stream);
  }
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    currentBlob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    showPlayback(currentBlob);
    ui.start.disabled = false;
    ui.stop.disabled = true;
    ui.rerecord.disabled = false;
    ui.keep.disabled = false;
    setStatus("Recording complete. Watch it, then keep it or re-record it.");
  };
  recorder.start(1000);
  startedAt = Date.now();
  timerId = window.setInterval(updateTimer, 250);
  ui.start.disabled = true;
  ui.stop.disabled = false;
  ui.rerecord.disabled = true;
  ui.keep.disabled = true;
  ui.recordingMessage.textContent = "Recording in progress…";
  setStatus("Recording. Select Stop recording whenever you are finished.");
}

function stopRecording(hitLimit = false) {
  if (recorder?.state !== "recording") return;
  window.clearInterval(timerId);
  ui.timer.textContent = formatTime(hitLimit ? MAX_SECONDS : Math.floor((Date.now() - startedAt) / 1000));
  recorder.stop();
  if (hitLimit) setStatus("The 5-minute limit was reached. Preparing your recording for review…");
}

function rerecord() {
  answers.delete(current);
  hasDownloaded = false;
  currentBlob = undefined;
  showPlayback();
  ui.rerecord.disabled = true;
  ui.keep.disabled = true;
  ui.start.disabled = !stream;
  ui.savedCount.textContent = `${answers.size} saved`;
  setStatus("Your previous attempt for this question was discarded. Record again when ready.");
}

function fileName(index) {
  const slug = QUESTIONS[index].toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${String(index + 1).padStart(2, "0")}-${slug}.${fileExtension}`;
}

function keepAnswer() {
  if (!currentBlob) return;
  answers.set(current, { blob: currentBlob, fileName: fileName(current) });
  hasDownloaded = false;
  if (current === QUESTIONS.length - 1) {
    ui.interviewCard.hidden = true;
    ui.finishCard.hidden = false;
    ui.progressText.textContent = "Interview complete";
    ui.progressBar.style.width = "100%";
    ui.savedCount.textContent = "10 saved";
    ui.playbackVideo.pause();
    setStatus("");
    return;
  }
  current += 1;
  updateQuestion();
}

// Minimal ZIP writer using uncompressed entries. This avoids uploading videos or depending on an external service.
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); table[n] = c >>> 0; }
  return table;
})();
function crc32(bytes) { let c = 0xffffffff; for (const byte of bytes) c = (c >>> 8) ^ crcTable[(c ^ byte) & 0xff]; return (c ^ 0xffffffff) >>> 0; }
function u16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
function u32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function dosDateTime(date) { const year = Math.max(1980, date.getFullYear()); return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }

async function createZip(entries) {
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(data);
    const local = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(now.time), u16(now.date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data];
    localParts.push(...local);
    const central = [u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(now.time), u16(now.date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name];
    centralParts.push(...central);
    offset += local.reduce((sum, part) => sum + part.length, 0);
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = [u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralSize), u32(offset), u16(0)];
  return new Blob([...localParts, ...centralParts, ...end], { type: "application/zip" });
}

async function downloadInterview() {
  ui.download.disabled = true;
  ui.downloadStatus.textContent = "Preparing your ZIP file. Larger recordings can take a moment…";
  try {
    const manifest = ["Video Interview", "", ...QUESTIONS.map((question, index) => `${String(index + 1).padStart(2, "0")}. ${question}`)].join("\n");
    const entries = [...Array(QUESTIONS.length).keys()].map((index) => ({ name: answers.get(index).fileName, blob: answers.get(index).blob }));
    entries.push({ name: "questions.txt", blob: new Blob([manifest], { type: "text/plain" }) });
    const zip = await createZip(entries);
    const url = URL.createObjectURL(zip);
    const link = document.createElement("a");
    link.href = url;
    link.download = "video-interview.zip";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    ui.downloadStatus.textContent = "Download started. Confirm that video-interview.zip is saved before closing this page.";
    hasDownloaded = true;
  } catch (error) {
    ui.downloadStatus.textContent = "The ZIP could not be prepared. Try again in a current desktop browser, or record shorter responses.";
  } finally { ui.download.disabled = false; }
}

ui.enable.addEventListener("click", enableCamera);
ui.start.addEventListener("click", startRecording);
ui.stop.addEventListener("click", () => stopRecording(false));
ui.rerecord.addEventListener("click", rerecord);
ui.keep.addEventListener("click", keepAnswer);
ui.download.addEventListener("click", downloadInterview);
ui.review.addEventListener("click", () => { current = 0; ui.finishCard.hidden = true; ui.interviewCard.hidden = false; updateQuestion(); });
window.addEventListener("beforeunload", (event) => { if (answers.size > 0 && !hasDownloaded) { event.preventDefault(); event.returnValue = ""; } });
updateQuestion();
