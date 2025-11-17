const STORAGE_KEYS = {
	users: "budget.users",
	currentUser: "budget.currentUser",
	categories: "budget.categories",
	transactions: "budget.transactions",
	savingsGoal: "budget.savingsGoal",
	savingsGoals: "budget.savingsGoals",
	fixedCosts: "budget.fixedCosts"
};

// Prefiks dla danych użytkownika
function getUserKey(key) {
	const currentUser = getCurrentUsername();
	return currentUser ? `${key}.${currentUser}` : key;
}

let currentUsername = null;

const DEFAULT_CATEGORIES = [
	"Wynagrodzenie",
	"Jedzenie",
	"Mieszkanie",
	"Paliwo",
	"Internet",
	"Oszczędności",
	"Rata kredytu",
	"Kot",
"Studia",
"Subskrypcje",
"Inne",
"Wyjścia",
];

let editingId = null;
let chartPie = null;
let chartBar = null;
let chartPieFixed = null;
let chartPieGoals = null;
let editingFixedId = null;
let inlineEditorOpen = false;

// Prosta historia zmian do cofania (Ctrl/Cmd+Z)
const historyStack = [];
function snapshotState() {
	return {
		transactions: JSON.parse(JSON.stringify(state.transactions)),
		fixedCosts: JSON.parse(JSON.stringify(state.fixedCosts)),
		savingsGoal: JSON.parse(JSON.stringify(state.savingsGoal)),
		savingsGoals: JSON.parse(JSON.stringify(state.savingsGoals)),
		filters: JSON.parse(JSON.stringify(state.filters))
	};
}
function pushHistory() {
	historyStack.push(snapshotState());
	// ogranicz rozmiar historii
	if (historyStack.length > 50) historyStack.shift();
}
function restoreFromSnapshot(s) {
	state.transactions = s.transactions;
	state.fixedCosts = s.fixedCosts;
	state.savingsGoal = s.savingsGoal;
	state.savingsGoals = s.savingsGoals || [];
	state.filters = s.filters;
	saveJSON(STORAGE_KEYS.transactions, state.transactions);
	saveJSON(STORAGE_KEYS.fixedCosts, state.fixedCosts);
	saveJSON(STORAGE_KEYS.savingsGoal, state.savingsGoal);
	saveJSON(STORAGE_KEYS.savingsGoals, state.savingsGoals);
}
function undoLast() {
	const prev = historyStack.pop();
	if (!prev) return;
	restoreFromSnapshot(prev);
	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
	renderFixedSettings();
	renderGoalsList();
}

// ----- System logowania -----
function getCurrentUsername() {
	if (!currentUsername) {
		currentUsername = localStorage.getItem(STORAGE_KEYS.currentUser);
	}
	return currentUsername;
}

function hashPassword(password) {
	// Proste hashowanie (dla lokalnej aplikacji offline)
	let hash = 0;
	for (let i = 0; i < password.length; i++) {
		const char = password.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return hash.toString(36);
}

function getUsers() {
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.users);
		return raw ? JSON.parse(raw) : {};
	} catch (e) {
		return {};
	}
}

function saveUsers(users) {
	localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function registerUser(username, password) {
	const users = getUsers();
	if (users[username]) {
		return { success: false, error: "Użytkownik już istnieje" };
	}
	if (username.length < 3) {
		return { success: false, error: "Nazwa użytkownika musi mieć min. 3 znaki" };
	}
	if (password.length < 4) {
		return { success: false, error: "Hasło musi mieć min. 4 znaki" };
	}
	users[username] = {
		passwordHash: hashPassword(password),
		createdAt: new Date().toISOString()
	};
	saveUsers(users);
	return { success: true };
}

function loginUser(username, password) {
	const users = getUsers();
	const user = users[username];
	if (!user) {
		return { success: false, error: "Nieprawidłowa nazwa użytkownika lub hasło" };
	}
	if (user.passwordHash !== hashPassword(password)) {
		return { success: false, error: "Nieprawidłowa nazwa użytkownika lub hasło" };
	}
	currentUsername = username;
	localStorage.setItem(STORAGE_KEYS.currentUser, username);
	return { success: true };
}

function logoutUser() {
	currentUsername = null;
	localStorage.removeItem(STORAGE_KEYS.currentUser);
	showLoginModal();
}

function showLoginModal() {
	const modal = document.getElementById("login-modal");
	const mainContent = document.getElementById("main-content");
	if (modal) modal.classList.remove("hidden");
	if (mainContent) mainContent.style.display = "none";
}

function hideLoginModal() {
	const modal = document.getElementById("login-modal");
	const mainContent = document.getElementById("main-content");
	if (modal) modal.classList.add("hidden");
	if (mainContent) mainContent.style.display = "block";
}

function updateUserUI() {
	const username = getCurrentUsername();
	const currentUserSpan = document.getElementById("current-user");
	const logoutBtn = document.getElementById("logout-btn");
	
	if (username) {
		if (currentUserSpan) {
			currentUserSpan.textContent = `Użytkownik: ${username}`;
			currentUserSpan.style.display = "inline";
		}
		if (logoutBtn) logoutBtn.style.display = "block";
	} else {
		if (currentUserSpan) currentUserSpan.style.display = "none";
		if (logoutBtn) logoutBtn.style.display = "none";
	}
}

// ----- Modal listy użytkowników -----
function openUsersModal() {
	const modal = document.getElementById("users-modal");
	const content = document.getElementById("users-list-content");
	
	if (!modal || !content) return;
	
	// Załaduj listę użytkowników
	const users = getUsers();
	const userNames = Object.keys(users);
	const currentUser = getCurrentUsername();
	
	if (userNames.length === 0) {
		content.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">Brak zarejestrowanych użytkowników</div>';
	} else {
		content.innerHTML = userNames.map(username => {
			const user = users[username];
			const isCurrent = username === currentUser;
			const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleString('pl-PL') : 'Nieznana';
			
			return `
				<div style="padding: 12px; border-bottom: 1px solid var(--outline);">
					<div style="font-weight: 600; color: ${isCurrent ? 'var(--accent)' : 'var(--text)'}; margin-bottom: 4px;">
						${username} ${isCurrent ? '<span style="color: var(--accent);">(zalogowany)</span>' : ''}
					</div>
					<div style="font-size: 12px; color: var(--muted);">
						Utworzono: ${createdDate}
					</div>
				</div>
			`;
		}).join('');
	}
	
	modal.classList.remove("hidden");
}

function closeUsersModal() {
	const modal = document.getElementById("users-modal");
	if (modal) modal.classList.add("hidden");
}

// Zamknij modal po kliknięciu w tło
document.addEventListener('DOMContentLoaded', () => {
	const usersModal = document.getElementById("users-modal");
	if (usersModal) {
		usersModal.addEventListener('click', (e) => {
			if (e.target === usersModal) {
				closeUsersModal();
			}
		});
	}
	
	// Załaduj zapisany tryb
	loadTheme();
});

// ----- Przełącznik trybu jasny/ciemny -----
function loadTheme() {
	const savedTheme = localStorage.getItem('budget.theme');
	const isLight = savedTheme === 'light';
	const body = document.body;
	const themeToggle = document.getElementById('theme-toggle');
	
	if (isLight) {
		body.classList.add('light-theme');
		if (themeToggle) themeToggle.textContent = '☀️';
	} else {
		body.classList.remove('light-theme');
		if (themeToggle) themeToggle.textContent = '🌙';
	}
}

function toggleTheme() {
	const body = document.body;
	const themeToggle = document.getElementById('theme-toggle');
	const isLight = body.classList.contains('light-theme');
	
	if (isLight) {
		body.classList.remove('light-theme');
		localStorage.setItem('budget.theme', 'dark');
		if (themeToggle) themeToggle.textContent = '🌙';
	} else {
		body.classList.add('light-theme');
		localStorage.setItem('budget.theme', 'light');
		if (themeToggle) themeToggle.textContent = '☀️';
	}
}

function loadJSON(key, fallback) {
	try {
		const userKey = getUserKey(key);
		const raw = localStorage.getItem(userKey);
		if (!raw) return fallback;
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}

function saveJSON(key, value) {
	const userKey = getUserKey(key);
	localStorage.setItem(userKey, JSON.stringify(value));
}

function formatPLN(value) {
	return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(value);
}

function byMonth(isoDate) {
	const d = new Date(isoDate);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	return `${y}-${m}`;
}

const state = {
	categories: [],
	transactions: [],
	savingsGoal: { target: null },
	savingsGoals: [],
	fixedCosts: [],
	filters: {
		month: null,
		type: "",
		category: ""
	}
};

// SEED + AUTO-MERGE kategorii (odporne na uszkodzony localStorage)
function initData() {
	let cats = null;
	try {
		const raw = localStorage.getItem(STORAGE_KEYS.categories);
		cats = raw ? JSON.parse(raw) : null;
	} catch {
		cats = null;
	}
	if (!Array.isArray(cats)) cats = [];
	const merged = Array.from(new Set([...cats, ...DEFAULT_CATEGORIES]));
	state.categories = merged;
	saveJSON(STORAGE_KEYS.categories, state.categories);

	const txs = loadJSON(STORAGE_KEYS.transactions, []);
	state.transactions = Array.isArray(txs) ? txs : [];

	const goal = loadJSON(STORAGE_KEYS.savingsGoal, null);
	if (goal && typeof goal.target === "number" && goal.target > 0) {
		state.savingsGoal = { target: goal.target };
	} else {
		state.savingsGoal = { target: null };
	}

	const fixed = loadJSON(STORAGE_KEYS.fixedCosts, []);
	state.fixedCosts = Array.isArray(fixed) ? fixed.filter(f =>
		f && typeof f.id === "string" &&
		typeof f.name === "string" &&
		typeof f.category === "string" &&
		typeof f.amount === "number" && f.amount >= 0 &&
		typeof f.day === "number" && f.day >= 1 && f.day <= 31
	) : [];

	const goals = loadJSON(STORAGE_KEYS.savingsGoals, []);
	state.savingsGoals = Array.isArray(goals) ? goals.filter(g =>
		g && typeof g.id === "string" &&
		typeof g.name === "string" &&
		typeof g.target === "number" && g.target > 0 &&
		typeof g.months === "number" && g.months > 0 &&
		typeof g.category === "string"
	) : [];
}

function addTransaction(tx) {
	pushHistory();
	state.transactions.push(tx);
	saveJSON(STORAGE_KEYS.transactions, state.transactions);
}

function updateTransaction(updated) {
	pushHistory();
	const idx = state.transactions.findIndex(t => t.id === updated.id);
	if (idx !== -1) {
		state.transactions[idx] = updated;
		saveJSON(STORAGE_KEYS.transactions, state.transactions);
	}
}

function removeTransaction(id) {
	pushHistory();
	state.transactions = state.transactions.filter(t => t.id !== id);
	saveJSON(STORAGE_KEYS.transactions, state.transactions);
}

function applyFilters(transactions) {
	let result = transactions.slice();
	if (state.filters.month) result = result.filter(t => byMonth(t.date) === state.filters.month);
	if (state.filters.type) result = result.filter(t => t.type === state.filters.type);
	if (state.filters.category) result = result.filter(t => t.category === state.filters.category);
	return result.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function computeMonthlyKpis(month) {
	const monthTxs = month
		? visibleTransactionsForCurrentFilters().filter(t => byMonth(t.date) === month)
		: state.transactions;
	const income = monthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
	const expense = monthTxs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
	return { income, expense, balance: income - expense };
}

function populateCategorySelects() {
	const selCreate = document.getElementById("category");
	const selFilter = document.getElementById("filter-category");
	const options = state.categories.map(c => `<option value="${c}">${c}</option>`).join("");
	selCreate.innerHTML = options;
	selFilter.innerHTML = `<option value="">Wszystkie</option>` + options;
}

function setDefaultMonth() {
	const input = document.getElementById("filter-month");
	const now = new Date();
	const val = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	input.value = val;
	state.filters.month = val;
}

function renderKpis() {
	const { income, expense, balance } = computeMonthlyKpis(state.filters.month);
	document.getElementById("kpi-income").textContent = formatPLN(income);
	document.getElementById("kpi-expense").textContent = formatPLN(expense);
	document.getElementById("kpi-balance").textContent = formatPLN(balance);
}

function monthFixedTransactions(month) {
	if (!month) return [];
	const [y, m] = month.split("-").map(x => Number(x));
	return state.fixedCosts.map(f => {
		const day = Math.min(f.day, 28); // bezpiecznie dla każdego miesiąca
		const date = `${y}-${String(m).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
		return {
			id: `fixed-${f.id}-${month}`,
			amount: f.amount,
			type: "expense",
			category: f.category,
			date,
			note: `Koszt stały: ${f.name}`,
			_fixed: true
		};
	});
}

function visibleTransactionsForCurrentFilters() {
	// Doliczamy koszty stałe tylko gdy wybrany jest konkretny miesiąc
	const month = state.filters.month;
	const base = state.transactions.slice();
	const withFixed = month ? base.concat(monthFixedTransactions(month)) : base;
	return withFixed;
}

function renderTable() {
	const tbody = document.getElementById("transactions-body");
	const table = document.getElementById("transactions-table");
	const empty = document.getElementById("empty-state");

	const source = visibleTransactionsForCurrentFilters();
	const filtered = applyFilters(source);
	if (filtered.length === 0) {
		table.classList.add("hidden");
		empty.classList.remove("hidden");
		tbody.innerHTML = "";
		return;
	}

	table.classList.remove("hidden");
	empty.classList.add("hidden");

	tbody.innerHTML = filtered.map(t => {
		const sign = t.type === "income" ? "+" : "-";
		const rowClass = t.type === "income" ? "row-income" : "row-expense";
		const actions = t._fixed ? "" : `
					<div class="row-actions">
						<button class="icon-btn" data-action="edit" data-id="${t.id}">Edytuj</button>
						<button class="icon-btn" data-action="delete" data-id="${t.id}">Usuń</button>
					</div>`;
		const note = t.note ? escapeHtml(t.note) : (t._fixed ? "(koszt stały)" : "");
		return `
			<tr>
				<td>${t.date}</td>
				<td><span class="badge">${t.type === "income" ? "Przychód" : "Wydatek"}</span></td>
				<td>${t.category}</td>
				<td>${note}</td>
				<td class="right ${rowClass}">${sign} ${formatPLN(t.amount)}</td>
				<td class="right">
					${actions}
				</td>
			</tr>
		`;
	}).join("");
}

function escapeHtml(str) {
	return str.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m]));
}

function onSubmitForm(e) {
	e.preventDefault();
	const amount = Number(document.getElementById("amount").value);
	const type = document.getElementById("type").value;
	const category = document.getElementById("category").value;
	const date = document.getElementById("date").value;
	const note = document.getElementById("note").value.trim();
	if (!date || !category || !(amount >= 0)) return;

	if (editingId) {
		updateTransaction({ id: editingId, amount, type, category, date, note });
		editingId = null;
		document.getElementById("submit-btn").textContent = "Dodaj";
	} else {
		const tx = {
			id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()),
			amount, type, category, date, note
		};
		addTransaction(tx);
	}

	document.getElementById("transaction-form").reset();
	document.getElementById("date").valueAsDate = new Date();
	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
}

function beginEditTransaction(tx) {
	document.getElementById("editing-id").value = tx.id;
	editingId = tx.id;
	document.getElementById("amount").value = String(tx.amount);
	document.getElementById("type").value = tx.type;
	document.getElementById("category").value = tx.category;
	document.getElementById("date").value = tx.date;
	document.getElementById("note").value = tx.note || "";
	document.getElementById("submit-btn").textContent = "Zapisz";
}

function onFiltersChange() {
	const m = document.getElementById("filter-month").value;
	const t = document.getElementById("filter-type").value;
	const c = document.getElementById("filter-category").value;
	state.filters.month = m || null;
	state.filters.type = t;
	state.filters.category = c;
	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
}

function onTableClick(e) {
	const btn = e.target.closest("button[data-action]");
	if (!btn) return;
	const action = btn.dataset.action;
	const id = btn.dataset.id;
	if (action === "delete") {
		removeTransaction(id);
		renderKpis();
		renderTable();
		renderCharts();
		renderSavings();
	}
	if (action === "edit") {
		const tx = state.transactions.find(t => t.id === id);
		if (tx) openInlineEditor(tx, btn.closest("tr"));
	}
}

function onResetData() {
	if (!confirm("Na pewno usunąć wszystkie dane budżetu?")) return;
	pushHistory();
	localStorage.removeItem(STORAGE_KEYS.transactions);
	localStorage.removeItem(STORAGE_KEYS.categories);
	localStorage.removeItem(STORAGE_KEYS.savingsGoal);
	localStorage.removeItem(STORAGE_KEYS.savingsGoals);
	localStorage.removeItem(STORAGE_KEYS.fixedCosts);
	initData();
	populateCategorySelects();
	setDefaultMonth();
	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
	renderFixedSettings();
	renderGoalsList();
}

function exportCsv() {
	const filtered = applyFilters(state.transactions);
	if (filtered.length === 0) {
		alert("Brak danych do eksportu dla wybranych filtrów.");
		return;
	}
	const header = ["id","data","typ","kategoria","opis","kwota_PLN"];
	const rows = filtered.map(t => [
		t.id, t.date, t.type, t.category, (t.note || "").replaceAll('"','""'), t.amount.toFixed(2)
	]);
	const csv = [header.join(","), ...rows.map(r => r.map(cell => /[",\n]/.test(cell) ? `"${cell}"` : cell).join(","))].join("\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const a = document.createElement("a");
	const monthSuffix = state.filters.month ? `_${state.filters.month}` : "";
	a.href = URL.createObjectURL(blob);
	a.download = `budzet${monthSuffix}.csv`;
	document.body.appendChild(a);
	a.click();
	setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function lastNMonthsKeys(n) {
	const out = [];
	const now = new Date();
	for (let i = 0; i < n; i++) {
		const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
		out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}`);
	}
	return out;
}

function generateDistinctColors(count) {
	const baseColors = [
		"#60a5fa", "#f87171", "#34d399", "#fbbf24", "#a78bfa",
		"#f472b6", "#22d3ee", "#fb7185", "#f97316", "#f59e0b",
		"#84cc16", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7",
		"#ec4899", "#14b8a6", "#8b5cf6", "#10b981", "#f43f5e"
	];
	
	if (count <= baseColors.length) {
		return baseColors.slice(0, count);
	}
	
	// Jeśli potrzeba więcej kolorów, generuj odcienie
	const colors = [...baseColors];
	for (let i = baseColors.length; i < count; i++) {
		const hue = (i * 137.508) % 360; // Złoty kąt dla równomiernego rozkładu
		colors.push(`hsl(${hue}, 65%, 60%)`);
	}
	return colors;
}

function renderCharts() {
	const month = state.filters.month;
	const typeFilter = state.filters.type || "all";

	// Pie
	const monthTx = visibleTransactionsForCurrentFilters().filter(t => byMonth(t.date) === month);
	const sourceTx = typeFilter === "all" ? monthTx : monthTx.filter(t => t.type === typeFilter);

	const byCat = sourceTx.reduce((m, t) => {
		const key = typeFilter === "all" ? `${t.type}|||${t.category}` : t.category;
		m[key] = (m[key] || 0) + t.amount;
		return m;
	}, {});

	const keysPie = Object.keys(byCat);
	const labelsPie = keysPie.map(k => {
		if (typeFilter !== "all") return k;
		const [type, category] = k.split("|||");
		return `${type === "income" ? "Przychody" : "Wydatki"} • ${category}`;
	});
	const dataPie = keysPie.map(k => byCat[k]);

	let backgroundColors;
	if (typeFilter === "income") {
		backgroundColors = generateDistinctColors(keysPie.length);
	} else if (typeFilter === "expense") {
		backgroundColors = generateDistinctColors(keysPie.length);
	} else {
		// Mix - osobne kolory dla przychodów i wydatków
		const incomes = keysPie.filter(k => k.startsWith("income"));
		const expenses = keysPie.filter(k => k.startsWith("expense"));
		const incomeColors = generateDistinctColors(incomes.length).map(c => c);
		const expenseColors = generateDistinctColors(expenses.length).map(c => c);
		backgroundColors = keysPie.map(k => {
			const isIncome = k.startsWith("income");
			const idx = isIncome 
				? incomes.indexOf(k)
				: expenses.indexOf(k);
			return isIncome ? incomeColors[idx] : expenseColors[idx];
		});
	}

	const datasetLabel = typeFilter === "income"
		? "Przychody (PLN)"
		: typeFilter === "expense"
			? "Wydatki (PLN)"
			: "Przychody i wydatki (PLN)";

	// Legenda dla głównego wykresu
	const legendMain = document.getElementById("legend-main");
	if (legendMain) {
		legendMain.innerHTML = labelsPie.map((label, i) => `
			<div class="legend-item">
				<div class="legend-color" style="background: ${backgroundColors[i]}"></div>
				<div class="legend-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
			</div>
		`).join("");
	}

	if (chartPie) chartPie.destroy();
	const pieCtx = document.getElementById("chart-pie")?.getContext("2d");
	if (pieCtx) {
		const pieTitle = typeFilter === "income" 
			? "Przychody" 
			: typeFilter === "expense" 
				? "Wydatki" 
				: "Wszystkie transakcje";
		chartPie = new Chart(pieCtx, {
			type: "pie",
			data: {
				labels: labelsPie,
				datasets: [{
					label: datasetLabel,
					data: dataPie,
					backgroundColor: backgroundColors
				}]
			},
			options: { 
				plugins: { 
					legend: { display: false },
					title: { display: true, text: pieTitle, color: "#e6edf3" }
				} 
			}
		});
	}

	// Pie - koszty stałe (po nazwie pozycji)
	const fixedTx = month ? monthFixedTransactions(month) : [];
	const fixedByName = fixedTx.reduce((m, t) => {
		const key = t.note?.replace(/^Koszt stały:\s*/, "") || "Pozycja";
		m[key] = (m[key] || 0) + t.amount;
		return m;
	}, {});
	const fixedLabels = Object.keys(fixedByName);
	const fixedData = fixedLabels.map(l => fixedByName[l]);
	const fixedColors = generateDistinctColors(fixedLabels.length);
	
	// Legenda dla kosztów stałych
	const legendFixed = document.getElementById("legend-fixed");
	if (legendFixed) {
		legendFixed.innerHTML = fixedLabels.map((label, i) => `
			<div class="legend-item">
				<div class="legend-color" style="background: ${fixedColors[i]}"></div>
				<div class="legend-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
			</div>
		`).join("");
	}
	
	if (chartPieFixed) chartPieFixed.destroy();
	const pieFixedCtx = document.getElementById("chart-pie-fixed")?.getContext("2d");
	if (pieFixedCtx) {
		chartPieFixed = new Chart(pieFixedCtx, {
			type: "pie",
			data: {
				labels: fixedLabels,
				datasets: [{
					label: "Wydatki stałe (PLN)",
					data: fixedData,
					backgroundColor: fixedColors
				}]
			},
			options: { 
				plugins: { 
					legend: { display: false },
					title: { display: true, text: "Koszty stałe", color: "#e6edf3" }
				} 
			}
		});
	}

	// Pie - cele oszczędnościowe (po nazwach celów) - wszystkie transakcje, nie tylko z wybranego miesiąca
	const goalsCategories = state.savingsGoals.map(g => g.category);
	const allGoalsTx = state.transactions.filter(t => t.type === "expense" && goalsCategories.includes(t.category));
	const byGoal = {};
	
	// Najpierw dodaj wszystkie cele, nawet jeśli nie mają transakcji
	state.savingsGoals.forEach(goal => {
		byGoal[goal.name] = 0;
	});
	
	// Potem zsumuj transakcje
	allGoalsTx.forEach(tx => {
		const goal = state.savingsGoals.find(g => g.category === tx.category);
		const goalName = goal ? goal.name : tx.category;
		byGoal[goalName] = (byGoal[goalName] || 0) + tx.amount;
	});
	
	const goalsLabels = Object.keys(byGoal);
	const goalsData = goalsLabels.map(l => byGoal[l]);
	const goalsColors = generateDistinctColors(goalsLabels.length);
	
	// Legenda dla celów oszczędnościowych
	const legendGoals = document.getElementById("legend-goals");
	if (legendGoals) {
		legendGoals.innerHTML = goalsLabels.map((label, i) => `
			<div class="legend-item">
				<div class="legend-color" style="background: ${goalsColors[i]}"></div>
				<div class="legend-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
			</div>
		`).join("");
	}
	
	if (chartPieGoals) chartPieGoals.destroy();
	const pieGoalsCtx = document.getElementById("chart-pie-goals")?.getContext("2d");
	if (pieGoalsCtx) {
		chartPieGoals = new Chart(pieGoalsCtx, {
			type: "pie",
			data: {
				labels: goalsLabels,
				datasets: [{
					label: "Cele oszczędnościowe (PLN)",
					data: goalsData,
					backgroundColor: goalsColors
				}]
			},
			options: { 
				plugins: { 
					legend: { display: false },
					title: { display: true, text: "Cele oszczędnościowe", color: "#e6edf3" }
				} 
			}
		});
	}

	// Bar
	const months = lastNMonthsKeys(6);
	const sums = months.map(m => state.transactions.filter(t => t.type === "expense" && byMonth(t.date) === m).reduce((s, t) => s + t.amount, 0));
	if (chartBar) chartBar.destroy();
	const barCtx = document.getElementById("chart-bar")?.getContext("2d");
	if (barCtx) {
		chartBar = new Chart(barCtx, {
			type: "bar",
			data: { labels: months, datasets: [{ label: "Wydatki (PLN)", data: sums, backgroundColor: "#f87171" }] },
			options: {
				scales: {
					x: { ticks: { color: "#e6edf3" }, grid: { color: "rgba(255,255,255,0.06)" } },
					y: { ticks: { color: "#e6edf3" }, grid: { color: "rgba(255,255,255,0.06)" } }
				},
				plugins: { 
					legend: { labels: { color: "#e6edf3" } },
					title: { display: true, text: "Wydatki (6 miesięcy)", color: "#e6edf3" }
				}
			}
		});
	}

	// Wskazówka dzienna
	const today = new Date();
	const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
	const daysLeft = Math.max(1, (end.getDate() - today.getDate()) + 1);
	const { income, expense } = computeMonthlyKpis(month);
	const remaining = Math.max(0, income - expense);
	document.getElementById("advice-daily").textContent = `${formatPLN(remaining / daysLeft)} / dzień`;
}

function sumSavingsTransactions() {
	return visibleTransactionsForCurrentFilters()
		.filter(t => t.type === "expense" && t.category === "Oszczędności")
		.reduce((sum, t) => sum + t.amount, 0);
}

function computeSavingsProgress() {
	const target = state.savingsGoal?.target;
	if (!(target > 0)) return null;
	const saved = sumSavingsTransactions();
	const percent = target > 0 ? (saved / target) * 100 : 0;
	return { target, saved, percent };
}

function renderSavings() {
	const label = document.getElementById("advice-savings");
	const progressBox = document.getElementById("savings-progress");
	const progressBar = document.getElementById("savings-progress-bar");
	const progressText = document.getElementById("savings-progress-text");
	const input = document.getElementById("savings-target");

	if (input) {
		input.value = state.savingsGoal?.target ? String(state.savingsGoal.target) : "";
	}

	const progress = computeSavingsProgress();
	if (!progress) {
		if (label) label.textContent = "Cel nieustawiony";
		if (progressBox) progressBox.classList.add("hidden");
		if (progressBar) {
			progressBar.style.width = "0%";
			progressBar.setAttribute("aria-valuenow", "0");
		}
		if (progressText) progressText.textContent = "";
		return;
	}

	const percentRounded = Math.round(progress.percent);
	const percentDisplay = Math.max(0, Math.min(100, percentRounded));
	const complete = progress.saved >= progress.target;
	if (label) {
		const base = `${percentRounded}% • ${formatPLN(progress.saved)} z ${formatPLN(progress.target)}`;
		label.textContent = complete ? `${base} (cel osiągnięty!)` : base;
	}

	if (progressBox) progressBox.classList.remove("hidden");
	if (progressBar) {
		progressBar.style.width = `${percentDisplay}%`;
		progressBar.setAttribute("aria-valuenow", String(percentDisplay));
	}
	if (progressText) {
		const status = complete ? "Cel osiągnięty!" : `Postęp: ${percentRounded}%`;
		const savedText = formatPLN(progress.saved);
		const goalText = formatPLN(progress.target);
		progressText.textContent = `${status} — ${savedText} z ${goalText}`;
	}
}

function onSavingsSubmit(e) {
	e.preventDefault();
	const input = document.getElementById("savings-target");
	if (!input) return;
	const target = Number(input.value);
	if (!(target > 0)) {
		alert("Podaj dodatnią kwotę celu.");
		return;
	}
	state.savingsGoal = { target };
	saveJSON(STORAGE_KEYS.savingsGoal, state.savingsGoal);
	renderSavings();
}

function onSavingsClear() {
	if (!(state.savingsGoal?.target > 0)) {
		state.savingsGoal = { target: null };
		localStorage.removeItem(STORAGE_KEYS.savingsGoal);
		renderSavings();
		return;
	}
	if (!confirm("Usunąć skonfigurowany cel oszczędności?")) return;
	state.savingsGoal = { target: null };
	localStorage.removeItem(STORAGE_KEYS.savingsGoal);
	renderSavings();
}

// ----- Wielocelowy system oszczędności z analityką -----
let editingGoalId = null;

function addCategoryIfNew(category) {
	if (!category || category.trim() === "") return;
	const trimmed = category.trim();
	if (!state.categories.includes(trimmed)) {
		state.categories.push(trimmed);
		saveJSON(STORAGE_KEYS.categories, state.categories);
		populateCategorySelects();
	}
}

function computeGoalProgress(goal) {
	const saved = state.transactions
		.filter(t => t.type === "expense" && t.category === goal.category)
		.reduce((sum, t) => sum + t.amount, 0);
	const percent = goal.target > 0 ? (saved / goal.target) * 100 : 0;
	const monthlyNeeded = goal.target / goal.months;
	return { saved, percent, monthlyNeeded };
}

function analyzeGoalStrategy(goal) {
	const today = new Date();
	const currentDay = today.getDate();
	const currentMonth = byMonth(today.toISOString().split('T')[0]);
	
	// Analiza historii wydatków z kategorii celu z ostatnich 3 miesięcy
	const last3Months = lastNMonthsKeys(3);
	const historicalSpending = last3Months.map(m => {
		return state.transactions
			.filter(t => t.type === "expense" && t.category === goal.category && byMonth(t.date) === m)
			.reduce((s, t) => s + t.amount, 0);
	});
	const avgMonthlySpending = historicalSpending.reduce((a, b) => a + b, 0) / last3Months.length;
	
	// Wydatki w tym miesiącu do tej pory
	const thisMonthSpending = state.transactions
		.filter(t => t.type === "expense" && t.category === goal.category && byMonth(t.date) === currentMonth)
		.reduce((s, t) => s + t.amount, 0);
	
	// Prognoza na koniec miesiąca (proporcjonalnie)
	const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
	const forecastMonthEnd = thisMonthSpending * (daysInMonth / currentDay);
	
	const progress = computeGoalProgress(goal);
	const remaining = Math.max(0, goal.target - progress.saved);
	
	let strategy = "";
	
	// Po 10. dniu miesiąca pokazujemy szczegółową analizę
	if (currentDay >= 10) {
		const daysLeft = daysInMonth - currentDay;
		const safeToSaveNow = Math.max(0, progress.monthlyNeeded - thisMonthSpending);
		
		strategy += `<strong>Analiza strategii (${currentDay}. dzień miesiąca):</strong><br>`;
		strategy += `• Wydano w tym m-cu: ${formatPLN(thisMonthSpending)}<br>`;
		strategy += `• Prognoza na koniec: ${formatPLN(forecastMonthEnd)}<br>`;
		strategy += `• Miesięczny cel: ${formatPLN(progress.monthlyNeeded)}<br>`;
		
		if (safeToSaveNow > 0) {
			strategy += `• <strong>Możesz odłożyć jeszcze: ${formatPLN(safeToSaveNow)}</strong> w tym miesiącu<br>`;
		} else {
			strategy += `• ✓ Cel miesięczny osiągnięty!<br>`;
		}
		
		strategy += `• Do celu pozostało: ${formatPLN(remaining)} (${Math.ceil(remaining / progress.monthlyNeeded)} m-cy)<br>`;
	} else {
		strategy += `<strong>Plan oszczędzania:</strong><br>`;
		strategy += `• Miesięcznie odkładaj: ${formatPLN(progress.monthlyNeeded)}<br>`;
		strategy += `• Średnia z ostatnich 3 m-cy: ${formatPLN(avgMonthlySpending)}<br>`;
		strategy += `• Do celu pozostało: ${formatPLN(remaining)}<br>`;
		
		if (avgMonthlySpending < progress.monthlyNeeded * 0.8) {
			strategy += `• ⚠️ Tempo oszczędzania jest zbyt wolne. Zwiększ wpłaty o ${formatPLN(progress.monthlyNeeded - avgMonthlySpending)}/m-c`;
		} else if (avgMonthlySpending >= progress.monthlyNeeded) {
			strategy += `• ✓ Świetne tempo! Cel osiągniesz na czas.`;
		}
	}
	
	return strategy;
}

function renderGoalsList() {
	const list = document.getElementById("goals-list");
	if (!list) return;
	
	if (state.savingsGoals.length === 0) {
		list.innerHTML = `<p class="muted">Brak celów oszczędnościowych. Dodaj pierwszy powyżej.</p>`;
		return;
	}
	
	list.innerHTML = state.savingsGoals.map(goal => {
		const progress = computeGoalProgress(goal);
		const percentRounded = Math.round(progress.percent);
		const percentDisplay = Math.max(0, Math.min(100, percentRounded));
		const complete = progress.saved >= goal.target;
		const strategy = analyzeGoalStrategy(goal);
		
		return `
			<div class="goal-card">
				<div class="goal-header">
					<div class="goal-title">${escapeHtml(goal.name)}</div>
					<span class="badge">${goal.category}</span>
				</div>
				<div class="goal-stats">
					<div class="goal-stat">
						<div class="goal-stat-label">Cel</div>
						<div class="goal-stat-value">${formatPLN(goal.target)}</div>
					</div>
					<div class="goal-stat">
						<div class="goal-stat-label">Oszczędzone</div>
						<div class="goal-stat-value" style="color: ${complete ? '#7bd389' : '#60a5fa'}">${formatPLN(progress.saved)}</div>
					</div>
					<div class="goal-stat">
						<div class="goal-stat-label">Postęp</div>
						<div class="goal-stat-value">${percentRounded}%</div>
					</div>
				</div>
				<div class="goal-progress-bar">
					<div class="progress-bar">
						<div class="progress-bar-fill" style="width: ${percentDisplay}%; background: ${complete ? '#7bd389' : '#2ea043'}"></div>
					</div>
				</div>
				<div class="goal-strategy">${strategy}</div>
				<div class="goal-actions">
					<button class="primary btn-sm" data-goal-id="${goal.id}" data-action="payment-goal">💰 Wpłata</button>
					<button class="icon-btn" data-goal-id="${goal.id}" data-action="edit-goal">Edytuj</button>
					<button class="icon-btn" data-goal-id="${goal.id}" data-action="delete-goal">Usuń</button>
				</div>
			</div>
		`;
	}).join("");
}

function onGoalSubmit(e) {
	e.preventDefault();
	const name = document.getElementById("goal-name").value.trim();
	const target = Number(document.getElementById("goal-target").value);
	const months = Number(document.getElementById("goal-months").value);
	const category = document.getElementById("goal-category").value.trim();
	
	if (!name || !(target > 0) || !(months > 0) || !category) return;
	
	pushHistory();
	
	// Dodaj kategorię do listy, jeśli jest nowa
	addCategoryIfNew(category);
	
	if (editingGoalId) {
		const idx = state.savingsGoals.findIndex(g => g.id === editingGoalId);
		if (idx !== -1) {
			state.savingsGoals[idx] = { ...state.savingsGoals[idx], name, target, months, category };
		}
		editingGoalId = null;
		document.getElementById("goal-submit-btn").textContent = "Dodaj cel";
		document.getElementById("goal-cancel").classList.add("hidden");
	} else {
		const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
		state.savingsGoals.push({ id, name, target, months, category });
	}
	
	saveJSON(STORAGE_KEYS.savingsGoals, state.savingsGoals);
	document.getElementById("multi-goal-form").reset();
	document.getElementById("goal-months").value = "12";
	renderGoalsList();
}

function onGoalCancel() {
	editingGoalId = null;
	document.getElementById("multi-goal-form").reset();
	document.getElementById("goal-months").value = "12";
	document.getElementById("goal-submit-btn").textContent = "Dodaj cel";
	document.getElementById("goal-cancel").classList.add("hidden");
}

function onGoalsListClick(e) {
	const btn = e.target.closest("button[data-action]");
	if (!btn) return;
	const action = btn.getAttribute("data-action");
	const id = btn.getAttribute("data-goal-id");
	if (!id) return;
	
	if (action === "payment-goal") {
		const goal = state.savingsGoals.find(g => g.id === id);
		if (!goal) return;
		openPaymentModal(goal);
	}
	
	if (action === "delete-goal") {
		if (!confirm("Usunąć ten cel oszczędnościowy?")) return;
		pushHistory();
		state.savingsGoals = state.savingsGoals.filter(g => g.id !== id);
		saveJSON(STORAGE_KEYS.savingsGoals, state.savingsGoals);
		renderGoalsList();
	}
	
	if (action === "edit-goal") {
		const goal = state.savingsGoals.find(g => g.id === id);
		if (!goal) return;
		editingGoalId = id;
		document.getElementById("goal-name").value = goal.name;
		document.getElementById("goal-target").value = String(goal.target);
		document.getElementById("goal-months").value = String(goal.months);
		document.getElementById("goal-category").value = goal.category;
		document.getElementById("goal-submit-btn").textContent = "Zapisz zmiany";
		document.getElementById("goal-cancel").classList.remove("hidden");
	}
}

// ----- Okno szybkiej wpłaty -----
function openPaymentModal(goal) {
	const modal = document.getElementById("payment-modal");
	const title = document.getElementById("payment-modal-title");
	const amountInput = document.getElementById("payment-amount");
	const dateInput = document.getElementById("payment-date");
	const noteInput = document.getElementById("payment-note");
	
	document.getElementById("payment-goal-id").value = goal.id;
	document.getElementById("payment-category").value = goal.category;
	
	if (title) title.textContent = `Wpłata na: ${goal.name}`;
	if (amountInput) amountInput.value = "";
	if (dateInput) dateInput.valueAsDate = new Date();
	if (noteInput) noteInput.value = "";
	
	if (modal) {
		modal.classList.remove("hidden");
		if (amountInput) amountInput.focus();
	}
}

function closePaymentModal() {
	const modal = document.getElementById("payment-modal");
	if (modal) modal.classList.add("hidden");
	document.getElementById("payment-form").reset();
}

function onPaymentSubmit(e) {
	e.preventDefault();
	const goalId = document.getElementById("payment-goal-id").value;
	const category = document.getElementById("payment-category").value;
	const amount = Number(document.getElementById("payment-amount").value);
	const date = document.getElementById("payment-date").value;
	const note = document.getElementById("payment-note").value.trim();
	
	if (!(amount > 0) || !date || !category) return;
	
	const goal = state.savingsGoals.find(g => g.id === goalId);
	const noteText = note || `Wpłata na cel: ${goal ? goal.name : category}`;
	
	pushHistory();
	const tx = {
		id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random()),
		amount,
		type: "expense",
		category,
		date,
		note: noteText
	};
	addTransaction(tx);
	
	closePaymentModal();
	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
	renderGoalsList();
}

// ----- PWA (Progressive Web App) - Instalacja i offline -----
let deferredPrompt = null;

// Rejestracja Service Worker dla offline
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('./sw.js')
			.then((registration) => {
				console.log('Service Worker zarejestrowany:', registration.scope);
				
				// Wykrywanie aktualizacji
				registration.addEventListener('updatefound', () => {
					const newWorker = registration.installing;
					if (newWorker) {
						newWorker.addEventListener('statechange', () => {
							if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
								// Nowa wersja dostępna - pokaż powiadomienie
								showUpdateNotification();
							}
						});
					}
				});
			})
			.catch((error) => {
				console.log('Błąd rejestracji Service Worker:', error);
			});
		
		// Sprawdź aktualizacje co 60 sekund
		setInterval(() => {
			navigator.serviceWorker.getRegistration().then(registration => {
				if (registration) {
					registration.update();
				}
			});
		}, 60000);
	});
}

// Powiadomienie o aktualizacji
function showUpdateNotification() {
	const notification = document.createElement('div');
	notification.style.cssText = `
		position: fixed;
		bottom: 20px;
		right: 20px;
		background: var(--card);
		border: 1px solid var(--accent);
		border-radius: 8px;
		padding: 16px;
		box-shadow: 0 4px 12px rgba(0,0,0,0.3);
		z-index: 10000;
		max-width: 300px;
	`;
	notification.innerHTML = `
		<div style="margin-bottom: 12px; font-weight: 600;">🔄 Dostępna aktualizacja</div>
		<div style="margin-bottom: 12px; font-size: 13px; color: var(--muted);">
			Nowa wersja aplikacji jest dostępna. Odśwież stronę aby zobaczyć zmiany.
		</div>
		<div style="display: flex; gap: 8px;">
			<button id="update-reload-btn" class="primary" style="flex: 1; padding: 8px;">Odśwież</button>
			<button id="update-dismiss-btn" class="outline" style="flex: 1; padding: 8px;">Później</button>
		</div>
	`;
	document.body.appendChild(notification);
	
	document.getElementById('update-reload-btn').addEventListener('click', () => {
		window.location.reload();
	});
	
	document.getElementById('update-dismiss-btn').addEventListener('click', () => {
		notification.remove();
	});
	
	// Auto-ukryj po 10 sekundach
	setTimeout(() => {
		if (notification.parentNode) {
			notification.style.opacity = '0';
			notification.style.transition = 'opacity 0.3s';
			setTimeout(() => notification.remove(), 300);
		}
	}, 10000);
}

// Obsługa instalacji PWA
window.addEventListener('beforeinstallprompt', (e) => {
	e.preventDefault();
	deferredPrompt = e;
	const installBtn = document.getElementById('install-btn');
	if (installBtn) {
		installBtn.style.display = 'block';
		installBtn.addEventListener('click', async () => {
			if (deferredPrompt) {
				deferredPrompt.prompt();
				const { outcome } = await deferredPrompt.userChoice;
				console.log('Wynik instalacji:', outcome);
				deferredPrompt = null;
				if (installBtn) installBtn.style.display = 'none';
			}
		});
	}
});

// Ukryj przycisk jeśli już zainstalowane
window.addEventListener('appinstalled', () => {
	console.log('Aplikacja zainstalowana');
	const installBtn = document.getElementById('install-btn');
	if (installBtn) installBtn.style.display = 'none';
	deferredPrompt = null;
});

// Sprawdź czy już zainstalowane
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
	const installBtn = document.getElementById('install-btn');
	if (installBtn) installBtn.style.display = 'none';
}

// ----- Obsługa formularza logowania -----
function initLogin() {
	const loginForm = document.getElementById("login-form");
	const loginTabs = document.querySelectorAll(".tab-btn");
	const registerFields = document.getElementById("register-fields");
	const loginTitle = document.getElementById("login-title");
	const loginSubmitBtn = document.getElementById("login-submit-btn");
	const loginError = document.getElementById("login-error");
	let isRegisterMode = false;
	
	// Przełączanie tabów
	loginTabs.forEach(tab => {
		tab.addEventListener("click", () => {
			const tabType = tab.getAttribute("data-tab");
			isRegisterMode = tabType === "register";
			
			loginTabs.forEach(t => t.classList.remove("active"));
			tab.classList.add("active");
			
			if (registerFields) registerFields.style.display = isRegisterMode ? "block" : "none";
			if (loginTitle) loginTitle.textContent = isRegisterMode ? "Rejestracja" : "Logowanie";
			if (loginSubmitBtn) loginSubmitBtn.textContent = isRegisterMode ? "Zarejestruj" : "Zaloguj";
			if (loginError) loginError.style.display = "none";
		});
	});
	
	// Obsługa formularza
	if (loginForm) {
		loginForm.addEventListener("submit", (e) => {
			e.preventDefault();
			const username = document.getElementById("login-username").value.trim();
			const password = document.getElementById("login-password").value;
			const passwordConfirm = document.getElementById("register-password-confirm").value;
			
			if (loginError) loginError.style.display = "none";
			
			if (isRegisterMode) {
				if (password !== passwordConfirm) {
					if (loginError) {
						loginError.textContent = "Hasła nie są identyczne";
						loginError.style.display = "block";
					}
					return;
				}
				const result = registerUser(username, password);
				if (result.success) {
					loginUser(username, password);
					hideLoginModal();
					updateUserUI();
					initData();
					populateCategorySelects();
					setDefaultMonth();
					renderKpis();
					renderTable();
					renderCharts();
					renderSavings();
					renderFixedSettings();
					renderGoalsList();
				} else {
					if (loginError) {
						loginError.textContent = result.error;
						loginError.style.display = "block";
					}
				}
			} else {
				const result = loginUser(username, password);
				if (result.success) {
					hideLoginModal();
					updateUserUI();
					initData();
					populateCategorySelects();
					setDefaultMonth();
					renderKpis();
					renderTable();
					renderCharts();
					renderSavings();
					renderFixedSettings();
					renderGoalsList();
				} else {
					if (loginError) {
						loginError.textContent = result.error;
						loginError.style.display = "block";
					}
				}
			}
		});
	}
	
	// Przycisk wylogowania
	const logoutBtn = document.getElementById("logout-btn");
	if (logoutBtn) {
		logoutBtn.addEventListener("click", () => {
			if (confirm("Na pewno chcesz się wylogować?")) {
				logoutUser();
				updateUserUI();
			}
		});
	}
	
	// Sprawdź czy użytkownik jest zalogowany
	const username = getCurrentUsername();
	if (username) {
		hideLoginModal();
		updateUserUI();
	} else {
		showLoginModal();
	}
}

function main() {
	// Najpierw sprawdź logowanie
	initLogin();
	
	// Jeśli użytkownik nie jest zalogowany, nie inicjalizuj reszty
	if (!getCurrentUsername()) {
		return;
	}
	
	initData();
	populateCategorySelects();
	setDefaultMonth();

	document.getElementById("transaction-form").addEventListener("submit", onSubmitForm);
	document.getElementById("filter-month").addEventListener("change", onFiltersChange);
	document.getElementById("filter-type").addEventListener("change", onFiltersChange);
	document.getElementById("filter-category").addEventListener("change", onFiltersChange);
	document.getElementById("transactions-body").addEventListener("click", onTableClick);
	document.getElementById("reset-data").addEventListener("click", onResetData);
	document.getElementById("export-csv").addEventListener("click", exportCsv);

	const savingsForm = document.getElementById("savings-form");
	if (savingsForm) savingsForm.addEventListener("submit", onSavingsSubmit);
	const savingsClear = document.getElementById("savings-clear");
	if (savingsClear) savingsClear.addEventListener("click", onSavingsClear);

	const fixedForm = document.getElementById("fixed-form");
	if (fixedForm) fixedForm.addEventListener("submit", onFixedSubmit);
	const fixedList = document.getElementById("fixed-list");
	if (fixedList) fixedList.addEventListener("click", onFixedListClick);
	const fixedCancel = document.getElementById("fixed-cancel");
	if (fixedCancel) fixedCancel.addEventListener("click", onFixedCancel);
	const ieForm = document.getElementById("inline-editor-form");
	if (ieForm) ieForm.addEventListener("submit", onInlineEditorSubmit);
	const ieCancel = document.getElementById("ie-cancel");
	if (ieCancel) ieCancel.addEventListener("click", closeInlineEditor);
	
	const goalForm = document.getElementById("multi-goal-form");
	if (goalForm) goalForm.addEventListener("submit", onGoalSubmit);
	const goalCancel = document.getElementById("goal-cancel");
	if (goalCancel) goalCancel.addEventListener("click", onGoalCancel);
	const goalsList = document.getElementById("goals-list");
	if (goalsList) goalsList.addEventListener("click", onGoalsListClick);
	
	const paymentForm = document.getElementById("payment-form");
	if (paymentForm) paymentForm.addEventListener("submit", onPaymentSubmit);
	const paymentCancel = document.getElementById("payment-cancel");
	if (paymentCancel) paymentCancel.addEventListener("click", closePaymentModal);
	const paymentClose = document.getElementById("payment-modal-close");
	if (paymentClose) paymentClose.addEventListener("click", closePaymentModal);
	
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			if (inlineEditorOpen) {
				closeInlineEditor();
			} else {
				const paymentModal = document.getElementById("payment-modal");
				if (paymentModal && !paymentModal.classList.contains("hidden")) {
					closePaymentModal();
				}
			}
		}
		// Ctrl/Cmd + Z -> cofnięcie ostatniego działania
		if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
			e.preventDefault();
			undoLast();
		}
	});

	document.getElementById("date").valueAsDate = new Date();

	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
	renderFixedSettings();
	renderGoalsList();
}

main();

// ----- Koszty stałe (ustawienia) -----
function renderFixedSettings() {
	const list = document.getElementById("fixed-list");
	const sel = document.getElementById("fixed-category");
	if (sel) {
		const options = state.categories.map(c => `<option value="${c}">${c}</option>`).join("");
		sel.innerHTML = options;
	}
	if (!list) return;
	if (state.fixedCosts.length === 0) {
		list.innerHTML = `<li class="muted">Brak kosztów stałych. Dodaj pierwszy powyżej.</li>`;
		return;
	}
	list.innerHTML = state.fixedCosts.map(f => `
		<li class="fixed-item">
			<div class="fixed-row">
				<div class="fixed-main">
					<strong>${escapeHtml(f.name)}</strong>
					<span class="muted">• ${f.category} • dzień ${f.day}</span>
				</div>
				<div class="fixed-amount">${formatPLN(f.amount)}</div>
			</div>
			<div class="fixed-actions">
				<button class="icon-btn" data-fixed-id="${f.id}" data-action="edit-fixed">Edytuj</button>
				<button class="icon-btn" data-fixed-id="${f.id}" data-action="remove-fixed">Usuń</button>
			</div>
		</li>
	`).join("");
}

function onFixedSubmit(e) {
	e.preventDefault();
	const name = document.getElementById("fixed-name").value.trim();
	const amount = Number(document.getElementById("fixed-amount").value);
	const category = document.getElementById("fixed-category").value;
	const day = Number(document.getElementById("fixed-day").value);
	if (!name || !(amount >= 0) || !category || !(day >= 1 && day <= 31)) return;
	pushHistory();
	if (editingFixedId) {
		const idx = state.fixedCosts.findIndex(f => f.id === editingFixedId);
		if (idx !== -1) {
			state.fixedCosts[idx] = { ...state.fixedCosts[idx], name, amount, category, day };
		}
	} else {
		const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
		state.fixedCosts.push({ id, name, amount, category, day });
	}
	saveJSON(STORAGE_KEYS.fixedCosts, state.fixedCosts);
	// wyczyszczenie formularza
	document.getElementById("fixed-form").reset();
	document.getElementById("fixed-day").value = "1";
	editingFixedId = null;
	const submitBtn = document.querySelector("#fixed-form button[type='submit']");
	if (submitBtn) submitBtn.textContent = "Dodaj koszt stały";
	const cancelBtn = document.getElementById("fixed-cancel");
	if (cancelBtn) cancelBtn.classList.add("hidden");
	renderFixedSettings();
	// odświeżenie danych widoku
	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
}

function onFixedListClick(e) {
	const btn = e.target.closest("button[data-action]");
	if (!btn) return;
	const action = btn.getAttribute("data-action");
	const id = btn.getAttribute("data-fixed-id");
	if (!id) return;
	if (action === "remove-fixed") {
		if (!confirm("Usunąć ten koszt stały?")) return;
		pushHistory();
		state.fixedCosts = state.fixedCosts.filter(f => f.id !== id);
		saveJSON(STORAGE_KEYS.fixedCosts, state.fixedCosts);
		renderFixedSettings();
		renderKpis();
		renderTable();
		renderCharts();
		renderSavings();
	}
	if (action === "edit-fixed") {
		const f = state.fixedCosts.find(x => x.id === id);
		if (!f) return;
		editingFixedId = id;
		document.getElementById("fixed-name").value = f.name;
		document.getElementById("fixed-amount").value = String(f.amount);
		document.getElementById("fixed-category").value = f.category;
		document.getElementById("fixed-day").value = String(f.day);
		const submitBtn = document.querySelector("#fixed-form button[type='submit']");
		if (submitBtn) submitBtn.textContent = "Zapisz zmiany";
		const cancelBtn = document.getElementById("fixed-cancel");
		if (cancelBtn) cancelBtn.classList.remove("hidden");
	}
}

function onFixedCancel() {
	editingFixedId = null;
	document.getElementById("fixed-form").reset();
	document.getElementById("fixed-day").value = "1";
	const submitBtn = document.querySelector("#fixed-form button[type='submit']");
	if (submitBtn) submitBtn.textContent = "Dodaj koszt stały";
	const cancelBtn = document.getElementById("fixed-cancel");
	if (cancelBtn) cancelBtn.classList.add("hidden");
}

// ----- Edytor inline transakcji -----
function openInlineEditor(tx, rowEl) {
	const editor = document.getElementById("transaction-inline-editor");
	if (!editor || !rowEl) return;
	document.getElementById("ie-id").value = tx.id;
	document.getElementById("ie-amount").value = String(tx.amount);
	document.getElementById("ie-type").value = tx.type;
	const selCat = document.getElementById("ie-category");
	if (selCat) selCat.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join("");
	document.getElementById("ie-category").value = tx.category;
	document.getElementById("ie-date").value = tx.date;
	document.getElementById("ie-note").value = tx.note || "";

	const rect = rowEl.getBoundingClientRect();
	const scrollY = window.scrollY || document.documentElement.scrollTop;
	const scrollX = window.scrollX || document.documentElement.scrollLeft;
	editor.style.top = `${rect.top + scrollY + rect.height + 6}px`;
	editor.style.left = `${Math.max(12, rect.left + scrollX)}px`;
	editor.classList.remove("hidden");
	inlineEditorOpen = true;
}

function closeInlineEditor() {
	const editor = document.getElementById("transaction-inline-editor");
	if (!editor) return;
	editor.classList.add("hidden");
	inlineEditorOpen = false;
}

function onInlineEditorSubmit(e) {
	e.preventDefault();
	const id = document.getElementById("ie-id").value;
	const amount = Number(document.getElementById("ie-amount").value);
	const type = document.getElementById("ie-type").value;
	const category = document.getElementById("ie-category").value;
	const date = document.getElementById("ie-date").value;
	const note = document.getElementById("ie-note").value.trim();
	if (!id || !date || !category || !(amount >= 0)) return;
	updateTransaction({ id, amount, type, category, date, note });
	closeInlineEditor();
	renderKpis();
	renderTable();
	renderCharts();
	renderSavings();
}