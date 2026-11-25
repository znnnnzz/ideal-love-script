"use strict";

const storageKey = "ideal-love-script-v1";
const chapterSize = 8;
const finalChapterStart = questions.length - chapterSize;
const dimensions = Object.keys(stories);

function newRun() {
  return { answers: Array(questions.length).fill(null), index: 0, finished: false };
}

function loadRun() {
  const run = newRun();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!Array.isArray(saved?.answers) || saved.answers.length !== questions.length) return run;

    // A valid saved run is a consecutive sequence that begins with the first question.
    const firstMissing = questions.findIndex(([, options], index) =>
      !Number.isInteger(saved.answers[index]) || !options[saved.answers[index]]
    );
    const answered = firstMissing < 0 ? questions.length : firstMissing;
    run.answers.splice(0, answered, ...saved.answers.slice(0, answered));
    const lastAllowed = Math.min(answered, questions.length - 1);
    run.index = Number.isInteger(saved.index) ? Math.max(0, Math.min(saved.index, lastAllowed)) : lastAllowed;
    run.finished = saved.finished === true && answered === questions.length;
  } catch {
    // The quiz can run in memory when storage is unavailable.
  }
  return run;
}

function calculateScores(answers) {
  const rows = Object.fromEntries(dimensions.map((key) => [key, {
    key, picks: 0, possible: 0, finalPicks: 0, finalPossible: 0, lastPick: -1,
  }]));

  questions.forEach(([, options], index) => {
    const inFinalChapter = index >= finalChapterStart;
    for (const [key] of options) {
      rows[key].possible += 1;
      if (inFinalChapter) rows[key].finalPossible += 1;
    }
    const choice = options[answers[index]];
    if (choice) {
      const row = rows[choice[0]];
      row.picks += 1;
      if (inFinalChapter) row.finalPicks += 1;
      row.lastPick = index;
    }
  });

  // Compare the exact ratios first, then preferences in the final chapter and the last relevant choice.
  return Object.values(rows).sort((left, right) =>
    right.picks * left.possible - left.picks * right.possible ||
    right.finalPicks * left.finalPossible - left.finalPicks * right.finalPossible ||
    right.lastPick - left.lastPick
  );
}

const get = (id) => document.getElementById(id);
const views = [get("home"), get("quiz"), get("result")];
const form = get("quiz-form");
const questionContent = get("question-content");
const questionTitle = get("question-title");
const optionsContainer = get("options");
const previousButton = get("previous");
const nextButton = get("next");
const downloadButton = get("download");
const shareCard = get("share-card");
const shareStatus = get("share-status");
const dialog = get("about-dialog");
let run = loadRun();

function saveRun() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(run));
  } catch {
    // The active run remains usable in this tab.
  }
}

function showView(id, heading) {
  for (const view of views) view.hidden = view.id !== id;
  if (heading) {
    window.scrollTo(0, 0);
    heading.focus({ preventScroll: true });
  }
}

function updateHomeButton() {
  const inProgress = run.answers.some((answer) => answer !== null);
  get("start-label").textContent = run.finished ? "查看上次结果" : inProgress ? "继续测试" : "开始测试";
}

function updateProgress() {
  const answered = run.answers.filter((answer) => answer !== null).length;
  const progress = get("progress");
  progress.value = answered;
  progress.setAttribute("aria-valuetext", `已答 ${answered} 道，共 ${questions.length} 道`);
}

function renderQuestion() {
  const [prompt, options] = questions[run.index];
  const chapter = Math.floor(run.index / chapterSize);
  get("chapter").textContent = `第${"一二三四五"[chapter]}幕 · ${chapters[chapter]}`;
  get("question-count").textContent = `第 ${run.index + 1} / ${questions.length} 题`;
  questionTitle.textContent = prompt;

  optionsContainer.replaceChildren(...options.map(([, text], index) => {
    const label = document.createElement("label");
    label.className = "option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "answer";
    radio.value = index;
    radio.checked = run.answers[run.index] === index;
    radio.className = "visually-hidden";
    const body = document.createElement("span");
    body.className = "option-body";
    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = "ABCD"[index];
    const copy = document.createElement("span");
    copy.textContent = text;
    body.append(letter, copy);
    label.append(radio, body);
    return label;
  }));

  previousButton.disabled = run.index === 0;
  nextButton.disabled = run.answers[run.index] === null;
  nextButton.textContent = run.index === questions.length - 1 ? "查看我的剧本" : "下一题";
  updateProgress();

  showView("quiz", questionTitle);
  questionContent.classList.remove("swap");
  void questionContent.offsetWidth;
  questionContent.classList.add("swap");
}

function renderResult() {
  const ranking = calculateScores(run.answers);
  const story = stories[ranking[0].key];
  get("story-title").textContent = story.title;
  get("story-line").textContent = story.line;
  get("story-reason").textContent = story.reason;
  get("story-strength").textContent = story.strength;
  get("story-egg").textContent = story.egg;
  get("story-tags").replaceChildren(...story.tags.map((tag) => {
    const chip = document.createElement("span");
    chip.textContent = tag;
    return chip;
  }));
  get("scores").replaceChildren(...ranking.map(({ key, picks, possible }) => {
    const value = Math.round(100 * picks / possible);
    const item = document.createElement("li");
    const label = document.createElement("div");
    label.className = "score-label";
    const name = document.createElement("span");
    name.textContent = stories[key].dimension;
    const percentage = document.createElement("span");
    percentage.textContent = `${value}%`;
    label.append(name, percentage);
    const track = document.createElement("div");
    track.className = "score-track";
    track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("span");
    bar.style.width = `${value}%`;
    track.append(bar);
    item.append(label, track);
    return item;
  }));
  shareStatus.textContent = "";
  downloadButton.disabled = !drawShareCard(story);
  showView("result", get("result-title"));
}

function drawShareCard(story) {
  const ctx = shareCard.getContext("2d");
  if (!ctx) return false;
  const { width, height } = shareCard;
  const [dark, light, gold] = story.palette;
  const paper = "#fff3e7";
  const serif = '"Songti SC", "Noto Serif CJK SC", SimSun, serif';
  const sans = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, dark);
  gradient.addColorStop(.55, light);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(450, 375, 30, 450, 375, 340);
  glow.addColorStop(0, `${gold}3d`);
  glow.addColorStop(1, `${gold}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 750);
  for (let i = 0; i < 155; i++) {
    const x = 52 + ((i * 79 + i * i * 47) % 797);
    const y = 148 + ((i * 59 + i * i * 83) % 535);
    ctx.fillStyle = `${gold}${i % 7 === 0 ? "ab" : "48"}`;
    ctx.beginPath();
    ctx.arc(x, y, i % 7 === 0 ? 2.3 : 1.1, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.strokeStyle = `${gold}9b`;
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, width - 68, height - 68);
  ctx.strokeStyle = `${gold}49`;
  ctx.lineWidth = 1;
  ctx.strokeRect(48, 48, width - 96, height - 96);
  drawArtwork(ctx, story);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = gold;
  ctx.font = '700 25px Georgia, serif';
  ctx.fillText("T H E   L O V E   S C R I P T", 450, 98);
  ctx.font = `28px ${sans}`;
  ctx.fillText("我的理想恋爱剧本", 450, 653);
  ctx.fillStyle = paper;
  ctx.font = `bold 94px ${serif}`;
  ctx.fillText(story.title, 450, 757, 730);
  ctx.font = `37px ${serif}`;
  ctx.fillText(story.line, 450, 860, 730);
  ctx.fillStyle = gold;
  ctx.font = `28px ${sans}`;
  ctx.fillText(story.tags.join("   ·   "), 450, 955, 730);

  ctx.strokeStyle = `${gold}80`;
  ctx.beginPath();
  ctx.moveTo(260, 1020);
  ctx.lineTo(640, 1020);
  ctx.stroke();
  ctx.font = `24px ${sans}`;
  ctx.fillText("心动放映室 · 趣味人格测试", 450, 1080);
  shareCard.setAttribute("aria-label", `恋爱剧本分享卡：${story.title}。${story.line}`);
  return true;
}

function drawArtwork(ctx, { artwork, palette: [dark, , gold] }) {
  ctx.save();
  ctx.translate(450, 378);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = gold;
  ctx.fillStyle = gold;
  ctx.lineWidth = 4;
  const ring = (x, y, rx, ry, angle = 0) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, 2 * Math.PI);
  };
  const path = (points) => {
    ctx.beginPath();
    for (const [index, [x, y]] of points.entries()) {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  ctx.globalAlpha = .45;
  ring(0, 0, 185, 185);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (artwork === "lamp") {
    path([[-98, 2], [-59, -96], [59, -96], [98, 2], [-98, 2]]);
    path([[0, 4], [0, 105]]);
    path([[-52, 108], [52, 108]]);
    path([[63, 12], [63, 45], [58, 50]]);
  } else if (artwork === "moon") {
    ctx.beginPath();
    ctx.arc(0, 0, 108, 1.13, 5.32);
    ctx.quadraticCurveTo(-110, -6, 46, 98);
    ctx.closePath();
    ctx.fill();
    path([[67, -42], [67, -8]]);
    path([[50, -25], [84, -25]]);
  } else if (artwork === "road") {
    ctx.beginPath();
    ctx.moveTo(-117, 111);
    ctx.bezierCurveTo(-124, 52, 103, 52, 74, 1);
    ctx.bezierCurveTo(58, -29, -25, -27, 37, -65);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-53, 111);
    ctx.bezierCurveTo(-63, 74, 133, 60, 98, -6);
    ctx.bezierCurveTo(84, -35, 15, -32, 47, -58);
    ctx.stroke();
    ring(59, -76, 8, 8);
    ctx.fill();
  } else if (artwork === "flower") {
    for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
      ring(Math.cos(angle) * 55, Math.sin(angle) * 55, 50, 17, angle);
      ctx.stroke();
    }
    ring(0, 0, 12, 12);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.stroke();
  } else if (artwork === "orbit") {
    ring(0, 0, 128, 54, -.52);
    ctx.stroke();
    ring(0, 0, 128, 54, .52);
    ctx.stroke();
    for (const [x, y] of [[-109, -64], [108, -63], [0, 0]]) {
      ring(x, y, 10, 10);
      ctx.fill();
    }
  } else if (artwork === "peaks") {
    path([[-124, 73], [-38, -62], [16, 24], [62, -53], [126, 73], [-124, 73]]);
    path([[-68, -16], [-37, -5], [-21, -33]]);
    ring(40, -102, 19, 19);
    ctx.stroke();
  }
  ctx.restore();
}

get("home-link").addEventListener("click", () => {
  updateHomeButton();
  showView("home", get("home-title"));
});
get("about-link").addEventListener("click", () => dialog.showModal());
get("start").addEventListener("click", () => {
  if (run.finished) renderResult();
  else renderQuestion();
});

optionsContainer.addEventListener("change", (event) => {
  run.answers[run.index] = Number(event.target.value);
  nextButton.disabled = false;
  updateProgress();
  saveRun();
});

previousButton.addEventListener("click", () => {
  if (run.index === 0) return;
  run.index -= 1;
  saveRun();
  renderQuestion();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (run.answers[run.index] === null) return;
  if (run.index === questions.length - 1) {
    if (run.answers.includes(null)) {
      run.index = run.answers.indexOf(null);
      saveRun();
      renderQuestion();
      return;
    }
    run.finished = true;
    saveRun();
    renderResult();
  } else {
    run.index += 1;
    saveRun();
    renderQuestion();
  }
});

get("restart").addEventListener("click", () => {
  run = newRun();
  saveRun();
  renderQuestion();
});

downloadButton.addEventListener("click", () => {
  const storyTitle = get("story-title").textContent;
  shareCard.toBlob((blob) => {
    if (!blob) {
      shareStatus.textContent = "图片生成失败，可以截取上方的分享卡。";
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `我的理想恋爱剧本-${storyTitle}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    shareStatus.textContent = "分享卡已生成，可在浏览器的下载记录中查看。";
  }, "image/png");
});

updateHomeButton();
