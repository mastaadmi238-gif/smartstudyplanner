/* ══════════════════════════════════════════════════════════
   StudyDesk — app.js
   Manages: Tab navigation · Planner · Tasks · Focus Timer
══════════════════════════════════════════════════════════ */

// ── Persistence helpers ────────────────────────────────────
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));
const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } };

// ══════════════════════════════════════════════════════════
// 1. TAB NAVIGATION
// ══════════════════════════════════════════════════════════
const navBtns = document.querySelectorAll('.nav-btn');
const tabs    = document.querySelectorAll('.tab');

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ══════════════════════════════════════════════════════════
// 2. PLANNER
// ══════════════════════════════════════════════════════════
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let sessions = load('sessions', []);

function renderPlanner() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '';

  DAYS.forEach(day => {
    const col = document.createElement('div');
    col.className = 'day-col';
    col.innerHTML = `<h3>${day}</h3>`;

    const daySessions = sessions.filter(s => s.day === day);
    if (daySessions.length === 0) {
      col.innerHTML += `<p class="empty-day">No sessions</p>`;
    } else {
      daySessions.forEach(s => {
        const chip = document.createElement('div');
        chip.className = 'session-chip';
        chip.innerHTML = `
          <div class="s-name">${escHtml(s.subject)}</div>
          <div class="s-meta">⏰ ${s.time} · ${s.duration} min</div>
          <button class="del-btn" data-id="${s.id}" title="Remove">✕</button>
        `;
        col.appendChild(chip);
      });
    }

    grid.appendChild(col);
  });

  // Delete session
  grid.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sessions = sessions.filter(s => s.id !== Number(btn.dataset.id));
      save('sessions', sessions);
      renderPlanner();
    });
  });
}

document.getElementById('addSessionBtn').addEventListener('click', () => {
  const subject  = document.getElementById('subjectInput').value.trim();
  const day      = document.getElementById('daySelect').value;
  const time     = document.getElementById('timeInput').value;
  const duration = Number(document.getElementById('durationInput').value);

  if (!subject) { alert('Please enter a subject name.'); return; }

  sessions.push({ id: Date.now(), subject, day, time, duration });
  save('sessions', sessions);
  document.getElementById('subjectInput').value = '';
  renderPlanner();
  updateStreak();
});

renderPlanner();

// ══════════════════════════════════════════════════════════
// 3. TASKS
// ══════════════════════════════════════════════════════════
let tasks       = load('tasks', []);
let activeFilter = 'all';

function renderTasks() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';

  const filtered = activeFilter === 'all'
    ? tasks
    : tasks.filter(t => t.priority === activeFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<li style="text-align:center;color:var(--muted);padding:20px;">No tasks here. Add one above!</li>`;
  }

  filtered.forEach(task => {
    const li = document.createElement('li');
    li.className = `task-item ${task.done ? 'done' : ''}`;
    li.innerHTML = `
      <div class="task-check ${task.done ? 'checked' : ''}" data-id="${task.id}">
        ${task.done ? '✓' : ''}
      </div>
      <span class="task-text">${escHtml(task.text)}</span>
      <span class="priority-badge ${task.priority}">${task.priority}</span>
      <button class="task-del" data-id="${task.id}" title="Delete">🗑</button>
    `;
    list.appendChild(li);
  });

  // Check/uncheck
  list.querySelectorAll('.task-check').forEach(el => {
    el.addEventListener('click', () => {
      const t = tasks.find(t => t.id === Number(el.dataset.id));
      if (t) { t.done = !t.done; save('tasks', tasks); renderTasks(); }
    });
  });

  // Delete
  list.querySelectorAll('.task-del').forEach(btn => {
    btn.addEventListener('click', () => {
      tasks = tasks.filter(t => t.id !== Number(btn.dataset.id));
      save('tasks', tasks);
      renderTasks();
    });
  });

  // Summary
  const done  = tasks.filter(t => t.done).length;
  const total = tasks.length;
  document.getElementById('taskSummary').textContent =
    total ? `${done} of ${total} tasks complete` : '';
}

document.getElementById('addTaskBtn').addEventListener('click', addTask);
document.getElementById('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

function addTask() {
  const text     = document.getElementById('taskInput').value.trim();
  const priority = document.getElementById('taskPriority').value;
  if (!text) return;
  tasks.push({ id: Date.now(), text, priority, done: false });
  save('tasks', tasks);
  document.getElementById('taskInput').value = '';
  renderTasks();
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderTasks();
  });
});

renderTasks();

// ══════════════════════════════════════════════════════════
// 4. FOCUS TIMER (Pomodoro)
// ══════════════════════════════════════════════════════════
let timerDuration = 25 * 60; // seconds
let timeLeft      = timerDuration;
let timerInterval = null;
let isRunning     = false;
let sessionsCompleted = load('sessionsToday', { date: today(), count: 0 });

// Reset count if it's a new day
if (sessionsCompleted.date !== today()) {
  sessionsCompleted = { date: today(), count: 0 };
  save('sessionsToday', sessionsCompleted);
}

const timerDisplay   = document.getElementById('timerDisplay');
const startBtn       = document.getElementById('startBtn');
const resetBtn       = document.getElementById('resetBtn');
const ringProgress   = document.getElementById('ringProgress');
const timerLabel     = document.getElementById('timerLabel');
const sessionsCount  = document.getElementById('sessionsCount');
const CIRCUMFERENCE  = 2 * Math.PI * 95; // r=95

const modeLabels = { 25: 'Focus Session', 5: 'Short Break', 15: 'Long Break' };

function setRing(fraction) {
  ringProgress.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
}

function updateDisplay() {
  const m = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const s = String(timeLeft % 60).padStart(2, '0');
  timerDisplay.textContent = `${m}:${s}`;
  setRing(timeLeft / timerDuration);
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;
  startBtn.textContent = 'Pause';

  timerInterval = setInterval(() => {
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      isRunning = false;
      startBtn.textContent = 'Start';
      onTimerEnd();
      return;
    }
    timeLeft++;
    updateDisplay();
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  startBtn.textContent = 'Resume';
}

function testTimer(){
  console.log(startTimer());
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  timeLeft = timerDuration;
  startBtn.textContent = 'Start';
  updateDisplay();
}

function onTimerEnd() {
  // Only count focus sessions
  const currentMode = document.querySelector('.mode-btn.active').dataset.mode;
  if (currentMode === '25') {
    sessionsCompleted.count++;
    save('sessionsToday', sessionsCompleted);
    sessionsCount.textContent = sessionsCompleted.count;
    updateStreak();
  }

  // Flash ring green briefly
  ringProgress.style.stroke = 'var(--success)';
  setTimeout(() => { ringProgress.style.stroke = 'var(--accent)'; }, 1200);

  notify('Session complete! Take a break.');
  resetTimer();
}

startBtn.addEventListener('click', () => {
  isRunning ? pauseTimer() : startTimer();
});

resetBtn.addEventListener('click', resetTimer);

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mins = Number(btn.dataset.mode);
    timerDuration = mins * 60;
    timeLeft = timerDuration;
    timerLabel.textContent = modeLabels[mins];

    // Colour ring by mode
    ringProgress.style.stroke =
      mins === 25 ? 'var(--accent)' :
      mins === 5  ? 'var(--success)' : 'var(--warn)';

    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = 'Start';
    updateDisplay();
  });
});

// Init timer display
sessionsCount.textContent = sessionsCompleted.count;
updateDisplay();

// ══════════════════════════════════════════════════════════
// 5. STREAK
// ══════════════════════════════════════════════════════════
function updateStreak() {
  let streak = load('streak', { lastDate: '', count: 0 });
  const t = today();

  if (streak.lastDate !== t) {
    // Did they study yesterday?
    const yesterday = dateOffset(-1);
    streak.count = streak.lastDate === yesterday ? streak.count + 1 : 1;
    streak.lastDate = t;
    save('streak', streak);
  }

  document.getElementById('streakCount').textContent = `${streak.count} day${streak.count !== 1 ? 's' : ''} 🔥`;
}

updateStreak();

// ══════════════════════════════════════════════════════════
// 6. UTILITIES
// ══════════════════════════════════════════════════════════
function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function notify(msg) {
  if (Notification.permission === 'granted') {
    new Notification('StudyDesk', { body: msg, icon: '' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification('StudyDesk', { body: msg });
    });
  }
}