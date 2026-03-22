let mySpeechRec, handPose, video;
let hands = [];    
let allElements = [];  
let sentenceCounter = 0; 
let lastText = "";      
let started = false; 
let keyboardBuffer = ""; 

// --- 空间与物理参数 ---
const SPACING_X = 75;     
const SPACING_Y = 40;     
const REPEL_DIST = 100;    
const PUSH_STRENGTH = 1.6; 
const FRICTION = 0.88;     

function setup() {
  createCanvas(windowWidth, windowHeight);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide(); 

  // 1. 语音识别 (en-US)
  mySpeechRec = new p5.SpeechRec('en-US', parseResult);
  mySpeechRec.continuous = true;   
  mySpeechRec.interimResults = true; 
  mySpeechRec.onEnd = () => { if(started) mySpeechRec.start(); }; 

  // 2. 手势识别 (ml5.js v1.0)
  handPose = ml5.handPose(video, () => {
    console.log("AI Ready! Hand Viewport Active.");
    handPose.detectStart(video, results => { hands = results; });
  });

  // 3. 粘贴监听
  window.addEventListener('paste', (event) => {
    event.preventDefault();
    let pasteData = (event.clipboardData || window.clipboardData).getData('text');
    if (pasteData) processPasteData(pasteData);
  });

  textFont('Courier New'); 
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
}

// --- 输入逻辑：语音 ---
function parseResult() {
  if (mySpeechRec.resultValue) {
    let currentText = mySpeechRec.resultString.toLowerCase();
    let wordsArr = currentText.split(' ');
    let lastWordsArr = lastText.split(' ');
    if (wordsArr.length > lastWordsArr.length) {
      if (lastWordsArr.length === 0 || (lastWordsArr.length === 1 && lastWordsArr[0] === "")) {
        sentenceCounter++;
      }
      for (let i = lastWordsArr.length; i < wordsArr.length; i++) {
        let newWord = wordsArr[i];
        if (newWord.length > 0) addWord(newWord, sentenceCounter);
      }
    }
    lastText = currentText;
  }
}

// --- 输入逻辑：键盘 ---
function keyPressed() {
  if (keyCode === BACKSPACE) {
    keyboardBuffer = keyboardBuffer.substring(0, keyboardBuffer.length - 1);
  } else if (key === ' ') {
    if (keyboardBuffer.length > 0) {
      addWord(keyboardBuffer, sentenceCounter);
      keyboardBuffer = "";
    }
  } else if (keyCode === ENTER) {
    if (keyboardBuffer.length > 0) {
      addWord(keyboardBuffer, sentenceCounter);
      keyboardBuffer = "";
    }
    sentenceCounter++;
  } else if (key.length === 1) {
    keyboardBuffer += key;
  }
}

function processPasteData(txt) {
  let words = txt.split(/\s+/);
  sentenceCounter++;
  for (let w of words) {
    if (w.length > 0) addWord(w, sentenceCounter);
  }
}

// --- 核心排版：十字编织 ---
function addWord(w, sIndex) {
  let margin = 60;
  let totalCount = allElements.length;
  let cols = floor((width - margin * 2) / SPACING_X);
  if (cols < 1) cols = 1;
  let colIndex = totalCount % cols;
  let rowIndex = floor(totalCount / cols);

  let angle = (sIndex % 2 === 0) ? HALF_PI : 0;
  let tx = margin + colIndex * SPACING_X;
  let ty = margin + rowIndex * SPACING_Y;

  allElements.push({
    text: w.toUpperCase(),
    x: tx, y: ty, vx: 0, vy: 0, 
    opacity: 0, angle: angle,
    dwellTimer: 0, isFalling: false, isWord: true 
  });
}

function mousePressed() {
  if (!started) {
    if (getAudioContext().state !== 'running') getAudioContext().resume();
    mySpeechRec.start();
    started = true;
  }
}

function draw() {
  push();
  translate(width, 0); scale(-1, 1);
  image(video, 0, 0, width, height); 
  pop();
  
  // 压暗遮罩
  background(0, 190); 

  // --- 手势视窗计算 ---
  let viewRect = null;
  let activeFingers = [];
  
  if (hands && hands.length >= 2) {
    let f1 = hands[0].index_finger_tip;
    let f2 = hands[1].index_finger_tip;
    let x1 = map(f1.x, 0, video.width, width, 0);
    let y1 = map(f1.y, 0, video.height, 0, height);
    let x2 = map(f2.x, 0, video.width, width, 0);
    let y2 = map(f2.y, 0, video.height, 0, height);
    
    viewRect = { x: min(x1, x2), y: min(y1, y2), w: abs(x1 - x2), h: abs(y1 - y2) };
    activeFingers = [{x:x1, y:y1}, {x:x2, y:y2}];
  } else if (hands && hands.length === 1) {
    let f = hands[0].index_finger_tip;
    activeFingers.push({ x: map(f.x, 0, video.width, width, 0), y: map(f.y, 0, video.height, 0, height) });
  }

  let dT = 1.0 / frameRate();
  let newLetters = [];

  // 渲染元素
  for (let i = allElements.length - 1; i >= 0; i--) {
    let e = allElements[i];
    
    // 检查是否在矩形内
    let inView = false;
    if (viewRect && e.x > viewRect.x && e.x < viewRect.x + viewRect.w && e.y > viewRect.y && e.y < viewRect.y + viewRect.h) {
      inView = true;
    }

    // 物理交互
    for (let f of activeFingers) {
      let d = dist(e.x, e.y, f.x, f.y);
      if (d < REPEL_DIST) {
        let ang = atan2(e.y - f.y, e.x - f.x);
        e.vx += cos(ang) * PUSH_STRENGTH * 0.15;
        e.vy += sin(ang) * PUSH_STRENGTH * 0.15;
      }
    }

    e.x += e.vx; e.y += e.vy;
    e.vx *= FRICTION; e.vy *= FRICTION;

    push();
    translate(e.x, e.y); rotate(e.angle);
    
    // --- 视觉转译：矩形内文字高亮且清晰 ---
    if (inView) {
      fill(255); // 纯白
      textSize(22); 
    } else {
      fill(255, 60); // 极淡的半透明
      textSize(16);
    }
    
    noStroke();
    text(e.text, 0, 0);
    pop();
  }

  // 绘制矩形框 (视频同款风格)
  if (viewRect) {
    stroke(255, 150);
    strokeWeight(1);
    noFill();
    rect(viewRect.x, viewRect.y, viewRect.w, viewRect.h);
    // 角点装饰
    fill(255);
    ellipse(viewRect.x, viewRect.y, 4);
    ellipse(viewRect.x + viewRect.w, viewRect.y + viewRect.h, 4);
  }

  if (started) drawInputTerminal();
}

function drawInputTerminal() {
  let boxX = 30;
  let boxY = height - 60;
  let boxW = 340;
  let boxH = 40;
  stroke(255, 100); noFill(); rect(boxX, boxY, boxW, boxH);
  fill(255, 150); noStroke(); textAlign(LEFT, BOTTOM); textSize(10);
  text("INPUT FIELD // CMD+V SUPPORTED", boxX, boxY - 5);
  textAlign(LEFT, CENTER); textSize(13);
  let cursor = (frameCount % 60 < 30) ? "_" : "";
  text("> " + keyboardBuffer.toUpperCase() + cursor, boxX + 10, boxY + boxH/2);
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }