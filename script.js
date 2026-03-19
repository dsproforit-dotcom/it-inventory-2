// 🔴 შენი Google Web App-ის ლინკი!
const API_URL = "https://script.google.com/macros/s/AKfycbzwxRy2h0t6Rj7ZqJd3FnFbzsyK9s67SdSOoX1kcl_4ndRYEOmVq-x6J3zbZQwS3gsoxQ/exec";

// 🔒 1. ვითხოვთ და ვინახავთ PIN კოდს
let APP_PIN = localStorage.getItem("inventory_pin");
if (!APP_PIN) {
  APP_PIN = prompt("🔒 გთხოვთ შეიყვანოთ უსაფრთხოების PIN კოდი (მაგ: 1234):");
  localStorage.setItem("inventory_pin", APP_PIN);
}

// =========================================================
// 🌐 API მესენჯერი (რომელიც ახლა პაროლსაც აგზავნის)
// =========================================================
async function fetchAPI(actionName, payloadData = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // 🔒 2. აქ კონვერტში ვდებთ ჩვენს PIN-საც!
      body: JSON.stringify({ action: actionName, payload: payloadData, pin: APP_PIN }) 
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
  } catch (error) {
    throw new Error("შეცდომა: " + error.message);
  }
}

// =========================================================
// 🏁 საიტის ჩატვირთვისას
// =========================================================
window.onload = async function() {
  loadDashboardData();
  try {
    const options = await fetchAPI("GET_DROPDOWNS");
    populateDropdowns(options);
    search();
  } catch (e) {
    console.error("ვერ ჩაიტვირთა Dropdowns", e);
  }
};

// =========================================================
// 📊 DASHBOARD & TABS
// =========================================================
function switchTab(tabName) {
  document.getElementById('view-dashboard').classList.remove('active');
  document.getElementById('view-inventory').classList.remove('active');
  document.getElementById('btn-dashboard').classList.remove('active');
  document.getElementById('btn-inventory').classList.remove('active');
  document.getElementById('view-' + tabName).classList.add('active');
  document.getElementById('btn-' + tabName).classList.add('active');
  if(tabName === 'dashboard') loadDashboardData();
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
    document.getElementById('kpi-low').innerText = data.lowStock;
    
    const actList = document.getElementById('activity-list');
    let actHtml = '<div class="table-container"><table style="margin:0;">';
    actHtml += '<thead><tr><th>Date</th><th>Action</th><th>Item</th><th>Qty</th><th>Route</th><th>Note</th></tr></thead><tbody>';
    
    data.recentHistory.forEach(r => {
      let route = (r.action === 'ADD' || r.action === 'RESTOCK') ? `➔ ${r.to}` : (r.action === 'TRANSFER' ? `${r.from} ➔ ${r.to}` : `From: ${r.from}`);
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
    document.getElementById('dash-message').innerText = "❌ შეცდომა მონაცემების ჩატვირთვისას";
  }
}

function filterSpecial(type) {
  switchTab('inventory');
  clearFilters();
  const filters = { query: '', category: 'ALL', location: 'ALL', limit: 'ALL', special: type };
  runSearch(filters);
}

// =========================================================
// 🔍 SEARCH & INVENTORY
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
  const filters = {
    query: document.getElementById('search').value,
    category: document.getElementById('filterCategory').value,
    location: document.getElementById('filterLocation').value,
    limit: document.getElementById('filterLimit').value
  };
  runSearch(filters);
}

async function runSearch(filters) {
  const messageDiv = document.getElementById('message');
  messageDiv.style.display = 'block'; messageDiv.className = 'message loading'; messageDiv.innerText = '⏫ Filtering...';
  
  try {
    const results = await fetchAPI("SEARCH_ITEMS", filters);
    displayResults(results);
  } catch (e) {
    displayError(e);
  }
}

async function loadHistory() {
  const messageDiv = document.getElementById('message'); messageDiv.style.display = 'block'; messageDiv.className = 'message loading'; messageDiv.innerHTML = '⌛ Loading History...';
  try {
    const historyData = await fetchAPI("GET_HISTORY");
    currentResults = historyData; 
    messageDiv.innerHTML = '📜 Last 100 Actions'; messageDiv.className = 'message success';
    const tbody = document.getElementById('resultsBody'); const thead = document.getElementById('tableHead');
    thead.innerHTML = `<tr><th>Date</th><th>Item ID</th><th>Name</th><th>Action</th><th>From</th><th>To</th><th>Qty</th><th>User</th><th>Note</th></tr>`;
    let html = '';
    historyData.forEach(row => { html += `<tr><td data-label="Date">${row[0]}</td><td data-label="Item ID"><strong>${row[1]}</strong></td><td data-label="Name">${row[2]}</td><td data-label="Action"><span class="badge ${row[3]}">${row[3]}</span></td><td data-label="From">${row[4]}</td><td data-label="To">${row[5]}</td><td data-label="Qty">${row[6]}</td><td data-label="User">${row[7]}</td><td data-label="Note">${row[8] || '-'}</td></tr>`; });
    tbody.innerHTML = html;
  } catch (e) {
    displayError(e);
  }
}

function displayResults(results) {
  currentResults = results;
  const messageDiv = document.getElementById('message');
  const tbody = document.getElementById('resultsBody');
  const thead = document.getElementById('tableHead');
  
  thead.innerHTML = `<tr><th>ID</th><th onclick="sortTable(2)" style="cursor:pointer">Name ↕️</th><th onclick="sortTable(3)" style="cursor:pointer">Category ↕️</th><th onclick="sortTable(4)" style="cursor:pointer">Qty ↕️</th><th onclick="sortTable(5)" style="cursor:pointer">Location ↕️</th><th>Warranty</th><th>Pic</th><th>Note</th><th>Action</th></tr>`;
  
  if (!results || results.length === 0) {
    messageDiv.innerHTML = '🔍 No items match these filters'; messageDiv.className = 'message error';
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No items found</td></tr>'; return;
  }

  messageDiv.innerHTML = `✅ Found ${results.length} items`; messageDiv.className = 'message success';
  let html = '';
  results.forEach(row => {
    let photoHtml = (row[7] && row[7].toString().startsWith('http')) ? `<a href="${row[7]}" target="_blank">🖼️</a>` : (row[7] || '-');
    html += `<tr><td data-label="ID"><strong>${row[1]}</strong></td><td data-label="Name">${row[2]}</td><td data-label="Category">${row[3]}</td><td data-label="Qty">${row[4]}</td><td data-label="Location">${row[5]}</td><td data-label="Warranty">${row[6]}</td><td data-label="Pic">${photoHtml}</td><td data-label="Note">${row[8] || '-'}</td><td data-label="Action"><button class="copy-btn" onclick="copyId('${row[1]}', this)">📋 Copy</button></td></tr>`;
  });
  tbody.innerHTML = html;
}

function clearFilters() {
  document.getElementById('search').value = ''; document.getElementById('filterCategory').value = 'ALL'; document.getElementById('filterLocation').value = 'ALL'; document.getElementById('filterLimit').value = '20';
  document.getElementById('resultsBody').innerHTML = '<tr><td colspan="9" style="text-align: center;">შედეგები გასუფთავებულია 📝</td></tr>';
  document.getElementById('message').style.display = 'none'; currentResults = [];
}

function displayError(e) { document.getElementById('message').innerText = '❌ Error: ' + e.message; document.getElementById('message').className = 'message error'; document.getElementById('message').style.display = 'block'; }
function copyId(id, btn) { navigator.clipboard.writeText(id).then(() => { const old = btn.innerText; btn.innerText = '✅ OK'; setTimeout(() => btn.innerText = old, 1500); }); }

let sortDirection = true;
function sortTable(columnIndex) {
  if (currentResults.length === 0) return; sortDirection = !sortDirection;
  currentResults.sort((a, b) => { let valA = a[columnIndex], valB = b[columnIndex]; if (!isNaN(valA) && !isNaN(valB)) return sortDirection ? valA - valB : valB - valA; valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); return sortDirection ? (valA < valB ? -1 : 1) : (valA < valB ? 1 : -1); });
  displayResults(currentResults);
}

// =========================================================
// ➕ ADD & 🔄 ACTION (MODALS)
// =========================================================
function openModal() { document.getElementById('addModal').style.display = 'block'; }
function closeModal() { document.getElementById('addModal').style.display = 'none'; ['addName', 'addQty', 'addWarranty', 'addPic', 'addNotes'].forEach(id => document.getElementById(id).value = ''); }

async function submitNewItem() {
  const btn = document.getElementById('submitBtn'); const name = document.getElementById('addName').value.trim(); const qty = document.getElementById('addQty').value.trim();
  if(!name || !qty) return alert("გთხოვთ, შეავსოთ Name და Quantity ველები!");
  const payload = { name: name, category: document.getElementById('addCategory').value, qty: qty, location: document.getElementById('addLocation').value, warranty: document.getElementById('addWarranty').value, pic: document.getElementById('addPic').value, notes: document.getElementById('addNotes').value };
  
  btn.innerText = "⏳ Saving..."; btn.disabled = true;
  try {
    const response = await fetchAPI("ADD_ITEM", payload);
    btn.innerText = "Save Item"; btn.disabled = false;
    closeModal(); showMessage(response.message, 'success'); search(); loadDashboardData();
  } catch (e) {
    btn.innerText = "Save Item"; btn.disabled = false; alert("შეცდომა: " + e.message);
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
  const btn = document.getElementById('btnTransSubmit'); const itemId = document.getElementById('transItemId').value.trim(); const qty = document.getElementById('transQty').value.trim(); const fromLoc = document.getElementById('transFromLoc').value; const action = document.getElementById('transAction').value; const toLoc = document.getElementById('transToLoc').value;
  if(!itemId || !qty) return alert("გთხოვთ, შეავსოთ Item ID და Quantity!");
  if(action === 'TRANSFER' && fromLoc === toLoc) return alert("საწყისი და საბოლოო ლოკაციები არ შეიძლება ემთხვეოდეს!");
  const payload = { itemId: itemId, action: action, qty: qty, resp: document.getElementById('transResp').value, fromLoc: fromLoc, toLoc: toLoc, note: document.getElementById('transNotes').value };
  
  btn.innerText = "⏳ Processing..."; btn.disabled = true;
  try {
    const response = await fetchAPI("TRANSFER_ITEM", payload);
    btn.innerText = "Execute Action"; btn.disabled = false;
    closeTransferModal(); showMessage(response.message, 'success'); search(); loadDashboardData();
  } catch (e) {
    btn.innerText = "Execute Action"; btn.disabled = false; alert("შეცდომა: " + e.message);
  }
}

function showMessage(text, type) {
  const msg = document.getElementById('message'); msg.style.display = 'block'; msg.className = 'message ' + type; msg.innerText = text;
}

window.addEventListener('click', function(event) {
  if (event.target === document.getElementById('addModal')) closeModal();
  if (event.target === document.getElementById('transferModal')) closeTransferModal();
});

// =========================================================
// 📷 LIVE SCANNER (ნამდვილი ვიდეო-სკანერი)
// =========================================================
let html5QrCode;
let isScannerRunning = false;

function startScanner(targetInputId) {
  document.getElementById('scannerModal').style.display = 'block';
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("qr-reader");
  }

  html5QrCode.start(
    { facingMode: "environment" }, // უპირატესობა უკანა კამერას
    { fps: 15, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      // 🎯 დაიჭირა კოდი!
      document.getElementById(targetInputId).value = decodedText;
      stopScanner();
      if (targetInputId === 'search') search(); // ეგრევე ვფილტრავთ
    },
    (errorMessage) => {
      // უბრალოდ ელოდება კოდს
    }
  ).then(() => {
    isScannerRunning = true;
  }).catch(err => {
    alert("კამერის ჩართვა ვერ მოხერხდა! გთხოვთ, მიეცით ბრაუზერს კამერის გამოყენების ნებართვა.");
    stopScanner();
  });
}

function stopScanner() {
  document.getElementById('scannerModal').style.display = 'none';
  if (html5QrCode && isScannerRunning) {
    html5QrCode.stop().then(() => {
      isScannerRunning = false;
    }).catch(err => console.log(err));
  }
}

// CSV Export
function downloadCSV() {
  if (!currentResults || currentResults.length === 0) return alert("ჯერ ჩატვირთეთ მონაცემები!");
  let csvContent = "\ufeff"; const isHistory = document.querySelector('thead th').innerText.includes('Date');
  csvContent += isHistory ? "Date,Item ID,Name,Action,From,To,Qty,User,Note\n" : "Date,ID,Name,Category,Qty,Location,Warranty,Photo_URL,Note\n";
  currentResults.forEach(row => { let cleanRow = row.map(cell => `"${String(cell).replace(/"/g, '""')}"`); csvContent += cleanRow.join(",") + "\n"; });
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); 
  link.setAttribute("href", url); link.setAttribute("download", `Export_${new Date().toLocaleDateString()}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}