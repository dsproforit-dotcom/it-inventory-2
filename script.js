// 🔴 შენი Google Web App-ის ლინკი!
const API_URL = "https://script.google.com/macros/s/AKfycbzwxRy2h0t6Rj7ZqJd3FnFbzsyK9s67SdSOoX1kcl_4ndRYEOmVq-x6J3zbZQwS3gsoxQ/exec";

let APP_PIN = localStorage.getItem("inventory_pin");
if (!APP_PIN) {
  APP_PIN = prompt("🔒 Please enter security PIN (e.g., 1234):");
  localStorage.setItem("inventory_pin", APP_PIN);
}

let fullInventoryData = [];
let fullHistoryData = [];
let currentResults = [];
let currentHistoryResults = [];

// =========================================================
// 🌐 API მესენჯერი
// =========================================================
async function fetchAPI(actionName, payloadData = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: actionName, payload: payloadData, pin: APP_PIN }) 
    });
    const result = await response.json();
    if (!result.success) {
      if (result.message.includes("PIN")) {
        localStorage.removeItem("inventory_pin");
        alert("🔒 Invalid PIN! Page will reload.");
        window.location.reload();
      }
      throw new Error(result.message);
    }
    return result.data;
  } catch (error) {
    throw new Error(error.message);
  }
}

window.onload = async function() {
  loadDashboardData();
  try {
    const options = await fetchAPI("GET_DROPDOWNS");
    populateDropdowns(options);
    await fetchFullInventory();
  } catch (e) {
    console.error("Dropdown loading failed", e);
  }
};

async function fetchFullInventory() {
  const messageDiv = document.getElementById('message');
  messageDiv.style.display = 'block'; messageDiv.className = 'message loading'; 
  messageDiv.innerText = '⏳ Loading Database...';
  try {
    fullInventoryData = await fetchAPI("SEARCH_ITEMS", { query: '', category: 'ALL', location: 'ALL', limit: 'ALL' });
    search();
  } catch(e) {
    displayError(e);
  }
}

// =========================================================
// 📊 DASHBOARD & TABS
// =========================================================
function switchTab(tabName) {
  ['dashboard', 'inventory', 'history'].forEach(name => {
    document.getElementById('view-' + name).classList.remove('active');
    document.getElementById('btn-' + name).classList.remove('active');
  });
  document.getElementById('view-' + tabName).classList.add('active');
  document.getElementById('btn-' + tabName).classList.add('active');
  
  if(tabName === 'dashboard') loadDashboardData();
  if(tabName === 'history' && fullHistoryData.length === 0) loadHistoryData();
}

async function loadDashboardData() {
  document.getElementById('dash-message').style.display = 'block';
  document.getElementById('kpi-section').style.display = 'none';
  document.getElementById('activity-section').style.display = 'none';

  try {
    const data = await fetchAPI("GET_DASHBOARD");
    document.getElementById('dash-message').style.display = 'none';
    document.getElementById('kpi-unique').innerText = data.totalItems;
    document.getElementById('kpi-total').innerText = data.totalQty;
    
    // 🔴 აი, ძველი ხაზის მაგივრად ეს ორი ახალი ჩაჯდა აქ:
    document.getElementById('kpi-low-it').innerText = data.lowStockIT;
    document.getElementById('kpi-low-floor').innerText = data.lowStockFloor;
    
    const actList = document.getElementById('activity-list');
    let actHtml = '<div class="table-container"><table style="margin:0;">';
    actHtml += '<thead><tr><th>Date</th><th>Action</th><th>Item</th><th>Qty</th><th>Route</th><th>Note</th></tr></thead><tbody>';
    
    data.recentHistory.forEach(r => {
      let route = "";
      if (r.action === 'ADD' || r.action === 'RESTOCK') route = `➔ ${r.to}`;
      else if (r.action === 'TRANSFER') route = `${r.from} ➔ ${r.to}`;
      else if (r.action === 'UPDATE') route = `At: ${r.from}`;
      else route = `From: ${r.from}`;
      actHtml += `
        <tr>
          <td data-label="Date" style="color: #7f8c8d; font-size: 13px;">${r.date}</td>
          <td data-label="Action"><span class="badge ${r.action}">${r.action}</span></td>
          <td data-label="Item"><strong>${r.item}</strong><br><span style="font-size:11px; color:#aaa;">${r.itemId}</span></td>
          <td data-label="Qty" style="font-weight: bold;">${r.qty}</td>
          <td data-label="Route" style="color: #555; font-size: 14px;">${route}</td>
          <td data-label="Note" style="color: #777; font-size: 13px; font-style: italic;">${r.note}</td>
        </tr>`;
    });
    actHtml += '</tbody></table></div>';
    actList.innerHTML = actHtml || "<i style='color:#7f8c8d;'>No recent activity found...</i>";
    
    document.getElementById('kpi-section').style.display = 'grid';
    document.getElementById('activity-section').style.display = 'block';
  } catch (e) {
    document.getElementById('dash-message').innerText = "❌ Error loading dashboard";
  }
}

// =========================================================
// 🔍 INVENTORY SEARCH
// =========================================================
function populateDropdowns(options) {
  const filterCat = document.getElementById('filterCategory'); const filterLoc = document.getElementById('filterLocation');
  const addCat = document.getElementById('addCategory'); const addLoc = document.getElementById('addLocation');
  const transFrom = document.getElementById('transFromLoc'); const transTo = document.getElementById('transToLoc');

  filterCat.innerHTML = '<option value="ALL">All Categories</option>'; filterLoc.innerHTML = '<option value="ALL">All Locations</option>';
  addCat.innerHTML = ''; addLoc.innerHTML = ''; transFrom.innerHTML = ''; transTo.innerHTML = '';

  options.categories.forEach(c => { filterCat.add(new Option(c, c)); addCat.add(new Option(c, c)); });
  options.locations.forEach(l => { filterLoc.add(new Option(l, l)); addLoc.add(new Option(l, l)); transFrom.add(new Option(l, l)); transTo.add(new Option(l, l)); });
}

function search() {
  const q = document.getElementById('search').value.toLowerCase().trim();
  const cat = document.getElementById('filterCategory').value;
  const loc = document.getElementById('filterLocation').value;
  const dateFilter = document.getElementById('filterDate').value;

  const searchTerms = q.split(' ').filter(term => term.length > 0);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart); monthStart.setMonth(monthStart.getMonth() - 1);

  let results = fullInventoryData.filter(row => {
    const searchableText = [row[1], row[2], row[3], row[5], row[8]].join(' ').toLowerCase();
    const matchQ = searchTerms.every(term => searchableText.includes(term));
    const matchCat = (cat === 'ALL') ? true : (row[3] === cat);
    const matchLoc = (loc === 'ALL') ? true : (row[5] === loc);
    
    let matchDate = true;
    if (dateFilter !== 'ALL') {
      const rowDate = new Date(row[0]);
      if (dateFilter === 'TODAY') matchDate = rowDate >= todayStart;
      else if (dateFilter === 'WEEK') matchDate = rowDate >= weekStart;
      else if (dateFilter === 'MONTH') matchDate = rowDate >= monthStart;
    }
    return matchQ && matchCat && matchLoc && matchDate;
  });

  displayResults(results);
}

function displayResults(results) {
  currentResults = results;
  const messageDiv = document.getElementById('message');
  const tbody = document.getElementById('resultsBody');
  
  if (!results || results.length === 0) {
    messageDiv.innerHTML = '🔍 No items match these filters'; messageDiv.className = 'message error'; messageDiv.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No items found</td></tr>'; return;
  }

  messageDiv.innerHTML = `✅ Found ${results.length} items`; messageDiv.className = 'message success'; messageDiv.style.display = 'block';
  let html = '';
  results.forEach(row => {
    let photoHtml = (row[7] && row[7].toString().startsWith('http')) ? `<a href="${row[7]}" target="_blank">🖼️</a>` : (row[7] || '-');
    html += `<tr><td data-label="ID"><strong>${row[1]}</strong></td><td data-label="Name">${row[2]}</td><td data-label="Category">${row[3]}</td><td data-label="Qty">${row[4]}</td><td data-label="Location">${row[5]}</td><td data-label="Warranty">${row[6]}</td><td data-label="Pic">${photoHtml}</td><td data-label="Note">${row[8] || '-'}</td><td data-label="Action"><button class="copy-btn" onclick="copyId('${row[1]}', this)">📋 Copy</button></td></tr>`;
  });
  tbody.innerHTML = html;
}

function clearFilters() {
  document.getElementById('search').value = ''; 
  document.getElementById('filterCategory').value = 'ALL'; 
  document.getElementById('filterLocation').value = 'ALL'; 
  document.getElementById('filterDate').value = 'ALL'; 
  search();
}

function filterSpecial(type) {
  switchTab('inventory');
  
  // 🛑 clearFilters()-ის მაგივრად ფილტრებს "ჩუმად" ვასუფთავებთ, რომ ორჯერ არ დახატოს ცხრილი
  document.getElementById('search').value = ''; 
  document.getElementById('filterCategory').value = 'ALL'; 
  document.getElementById('filterLocation').value = 'ALL'; 
  document.getElementById('filterDate').value = 'ALL'; 
  
  if (type === 'lowStockIT') {
    let results = fullInventoryData.filter(row => row[3] === 'Consumables' && row[5] === 'IT Warehouse' && Number(row[4]) >= 0 && Number(row[4]) <= 3);
    displayResults(results);
  } 
  else if (type === 'lowStockFloor') {
    let results = fullInventoryData.filter(row => row[3] === 'Consumables' && row[5] === "Floor's Cabinet" && Number(row[4]) >= 0 && Number(row[4]) <= 1);
    displayResults(results);
  }
}

// =========================================================
// 📜 HISTORY TAB LOGIC
// =========================================================
async function loadHistoryData() {
  const tbody = document.getElementById('historyResultsBody');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;" class="loading">⏳ Fetching Full History...</td></tr>';
  try {
    fullHistoryData = await fetchAPI("GET_HISTORY");
    searchHistory();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: red;">❌ Error: ${e.message}</td></tr>`;
  }
}

function searchHistory() {
  const q = document.getElementById('historySearch').value.toLowerCase().trim();
  const actionType = document.getElementById('historyAction').value;
  const dateFilter = document.getElementById('historyDate').value;

  const searchTerms = q.split(' ').filter(term => term.length > 0);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart); monthStart.setMonth(monthStart.getMonth() - 1);

  let results = fullHistoryData.filter(row => {
    const searchableText = row.slice(1).join(' ').toLowerCase();
    const matchQ = searchTerms.every(term => searchableText.includes(term));
    const matchAction = (actionType === 'ALL') ? true : (row[3] === actionType);
    
    let matchDate = true;
    if (dateFilter !== 'ALL') {
      const rowDate = new Date(row[0]);
      if (dateFilter === 'TODAY') matchDate = rowDate >= todayStart;
      else if (dateFilter === 'WEEK') matchDate = rowDate >= weekStart;
      else if (dateFilter === 'MONTH') matchDate = rowDate >= monthStart;
    }
    return matchQ && matchAction && matchDate;
  });

  currentHistoryResults = results;
  drawHistoryTable(results);
}

function drawHistoryTable(data) {
  const tbody = document.getElementById('historyResultsBody');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">🔍 No history records found</td></tr>';
    return;
  }
  let html = '';
  data.forEach(row => { 
    html += `<tr>
      <td data-label="Date" style="font-size:12px; color:#555;">${row[0]}</td>
      <td data-label="Item ID"><strong>${row[1]}</strong></td>
      <td data-label="Name">${row[2]}</td>
      <td data-label="Action"><span class="badge ${row[3]}">${row[3]}</span></td>
      <td data-label="From">${row[4]}</td>
      <td data-label="To">${row[5]}</td>
      <td data-label="Qty">${row[6]}</td>
      <td data-label="User">${row[7]}</td>
      <td data-label="Note">${row[8] || '-'}</td>
    </tr>`; 
  });
  tbody.innerHTML = html;
}

function clearHistoryFilters() {
  document.getElementById('historySearch').value = '';
  document.getElementById('historyAction').value = 'ALL';
  document.getElementById('historyDate').value = 'ALL';
  searchHistory();
}

// =========================================================
// ➕ ADD & 🔄 ACTION (MODALS)
// =========================================================
function openModal() { document.getElementById('addModal').style.display = 'block'; }
function closeModal() { document.getElementById('addModal').style.display = 'none'; ['addId', 'addName', 'addQty', 'addWarranty', 'addPic', 'addNotes'].forEach(id => document.getElementById(id).value = ''); }

async function submitNewItem() {
  const btn = document.getElementById('submitBtn'); 
  const customId = document.getElementById('addId').value.trim();
  const name = document.getElementById('addName').value.trim(); 
  const qty = document.getElementById('addQty').value.trim();
  
  if(!name || !qty) return alert("Please fill Name and Quantity!");
  
  const payload = { itemId: customId, name: name, category: document.getElementById('addCategory').value, qty: qty, location: document.getElementById('addLocation').value, warranty: document.getElementById('addWarranty').value, pic: document.getElementById('addPic').value, notes: document.getElementById('addNotes').value };
  
  btn.innerText = "⏳ Saving..."; btn.disabled = true;
  try {
    const response = await fetchAPI("ADD_ITEM", payload);
    btn.innerText = "Save Item"; btn.disabled = false;
    closeModal(); showMessage(response.message, 'success'); fetchFullInventory(); loadDashboardData(); fullHistoryData = []; // Reset history so it reloads fresh
  } catch (e) {
    btn.innerText = "Save Item"; btn.disabled = false; alert("Error: " + e.message);
  }
}

function openTransferModal() { document.getElementById('transferModal').style.display = 'block'; }
function closeTransferModal() { document.getElementById('transferModal').style.display = 'none'; ['transItemId', 'transQty', 'transResp', 'transNotes'].forEach(id => document.getElementById(id).value = ''); document.getElementById('transAction').value = 'TRANSFER'; toggleToLocation(); }

function toggleToLocation() { 
  const action = document.getElementById('transAction').value; 
  document.getElementById('toLocContainer').style.display = (action === 'TRANSFER') ? 'block' : 'none'; 
  const lblFrom = document.getElementById('lblFromLoc');
  if(lblFrom) lblFrom.innerText = (action === 'RESTOCK') ? 'Add To Location *' : 'From Location *';
}

async function submitTransfer() {
  const btn = document.getElementById('btnTransSubmit'); const itemId = document.getElementById('transItemId').value.trim(); const qty = document.getElementById('transQty').value.trim(); const fromLoc = document.getElementById('transFromLoc').value; const action = document.getElementById('transAction').value; const toLoc = (action === 'TRANSFER') ? document.getElementById('transToLoc').value : 'N/A';
  if(!itemId || !qty) return alert("Please fill Item ID and Quantity!");
  if(action === 'TRANSFER' && fromLoc === toLoc) return alert("Locations cannot be the same!");
  const payload = { itemId: itemId, action: action, qty: qty, resp: document.getElementById('transResp').value, fromLoc: fromLoc, toLoc: toLoc, note: document.getElementById('transNotes').value };
  
  btn.innerText = "⏳ Processing..."; btn.disabled = true;
  try {
    const response = await fetchAPI("TRANSFER_ITEM", payload);
    btn.innerText = "Execute Action"; btn.disabled = false;
    closeTransferModal(); showMessage(response.message, 'success'); fetchFullInventory(); loadDashboardData(); fullHistoryData = []; // Reset history so it reloads fresh
  } catch (e) {
    btn.innerText = "Execute Action"; btn.disabled = false; alert("Error: " + e.message);
  }
}

// =========================================================
// 📷 LIVE SCANNER & UTILS
// =========================================================
let html5QrCode;
let isScannerRunning = false;

function startScanner(targetInputId) {
  document.getElementById('scannerModal').style.display = 'block';
  if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");

  html5QrCode.start(
    { facingMode: "environment" }, { fps: 15, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      document.getElementById(targetInputId).value = decodedText;
      stopScanner();
      if (targetInputId === 'search') search();
      if (targetInputId === 'historySearch') searchHistory();
    },
    (errorMessage) => { }
  ).then(() => { isScannerRunning = true; }).catch(err => {
    alert("Camera initialization failed!"); stopScanner();
  });
}

function stopScanner() {
  document.getElementById('scannerModal').style.display = 'none';
  if (html5QrCode && isScannerRunning) {
    html5QrCode.stop().then(() => { isScannerRunning = false; }).catch(err => console.log(err));
  }
}

function checkScannerClick(e) { if (e.target.id === 'scannerModal') stopScanner(); }
window.addEventListener('click', function(event) {
  if (event.target === document.getElementById('addModal')) closeModal();
  if (event.target === document.getElementById('transferModal')) closeTransferModal();
});

function displayError(e) { document.getElementById('message').innerText = '❌ Error: ' + e.message; document.getElementById('message').className = 'message error'; document.getElementById('message').style.display = 'block'; }
function showMessage(text, type) { const msg = document.getElementById('message'); msg.style.display = 'block'; msg.className = 'message ' + type; msg.innerText = text; }
function copyId(id, btn) { navigator.clipboard.writeText(id).then(() => { const old = btn.innerText; btn.innerText = '✅ OK'; setTimeout(() => btn.innerText = old, 1500); }); }

let sortDirection = true;
function sortTable(columnIndex) {
  if (currentResults.length === 0) return; sortDirection = !sortDirection;
  currentResults.sort((a, b) => { let valA = a[columnIndex], valB = b[columnIndex]; if (!isNaN(valA) && !isNaN(valB)) return sortDirection ? valA - valB : valB - valA; valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); return sortDirection ? (valA < valB ? -1 : 1) : (valA < valB ? 1 : -1); });
  displayResults(currentResults);
}

function downloadCSV() {
  if (!currentResults || currentResults.length === 0) return alert("No data to export!");
  let csvContent = "\ufeffDate,ID,Name,Category,Qty,Location,Warranty,Photo_URL,Note\n";
  currentResults.forEach(row => { let cleanRow = row.map(cell => `"${String(cell).replace(/"/g, '""')}"`); csvContent += cleanRow.join(",") + "\n"; });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); 
  link.setAttribute("href", url); link.setAttribute("download", `Inventory_Export_${new Date().toLocaleDateString()}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function downloadHistoryCSV() {
  if (!currentHistoryResults || currentHistoryResults.length === 0) return alert("No history data to export!");
  let csvContent = "\ufeffDate,Item ID,Name,Action,From,To,Qty,User,Note\n";
  currentHistoryResults.forEach(row => { 
    let cleanRow = row.map(cell => `"${String(cell).replace(/"/g, '""')}"`); 
    csvContent += cleanRow.join(",") + "\n"; 
  });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); 
  const url = URL.createObjectURL(blob); 
  const link = document.createElement("a"); 
  link.setAttribute("href", url); 
  link.setAttribute("download", `History_Export_${new Date().toLocaleDateString()}.csv`); 
  document.body.appendChild(link); 
  link.click(); 
  document.body.removeChild(link);
}