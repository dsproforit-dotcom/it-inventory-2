/*************************************************
 * CONFIG
 *************************************************/
const DB_SHEET = 'ITEMS_DB';
const HISTORY_SHEET = 'ITEM_HISTORY';


// ეს ფუნქცია ხსნის ჩვენს ვებ-გვერდს, მაგრამ ახლა უკვე იყენებს "Template" სისტემას
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('IT Inventory')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ეს არის "ჯადოსნური" ფუნქცია, რომელიც სხვა ფაილებს აწებებს ერთმანეთს
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/*************************************************
 * SEARCH & HISTORY DISPLAY FUNCTIONS
 *************************************************/

function searchItems(filters) {
  const db = SpreadsheetApp.getActive().getSheetByName(DB_SHEET);
  const values = db.getDataRange().getValues();
  let results = values.slice(1);

  if (filters.query) {
    const q = filters.query.toLowerCase().trim();
    results = results.filter(r => String(r[1]).toLowerCase().includes(q) || String(r[2]).toLowerCase().includes(q));
  }
  if (filters.category && filters.category !== 'ALL') results = results.filter(r => r[3] === filters.category);
  if (filters.location && filters.location !== 'ALL') results = results.filter(r => r[5] === filters.location);

  // --- სპეციალური ფილტრები დაშბორდის კლიკისთვის ---
  if (filters.special === 'lowStock') {
    // ვაფილტრავთ მხოლოდ: კატეგორია Consumables, ლოკაცია IT Warehouse და რაოდენობა <= 5
    results = results.filter(r => r[3] === 'Consumables' && r[5] === 'IT Warehouse' && Number(r[4]) > 0 && Number(r[4]) <= 5);
  }
  if (filters.special === 'warranty') {
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    // აქ ჯერჯერობით ყველა ნივთის გარანტიას ვამოწმებთ, მომავალში ამასაც დავხვეწთ თუ დაგჭირდა
    results = results.filter(r => r[6] && new Date(r[6]) <= nextMonth);
  }
  // ------------------------------------------

  results.sort((a, b) => new Date(b[0]) - new Date(a[0]));
  if (filters.limit && filters.limit !== 'ALL') results = results.slice(0, parseInt(filters.limit));

  return formatData(results);
}

// ახალი ფუნქცია: ისტორიის წამოღება
function getHistory() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(HISTORY_SHEET);
  const data = sheet.getDataRange().getValues().slice(1);
  return formatData(data.reverse().slice(0, 100)); // ბოლო 100 ჩანაწერი
}

// მონაცემების ფორმატირება (თარიღები და null-ები)
function formatData(data) {
  return data.map(row => row.map(cell => {
    if (cell instanceof Date) return Utilities.formatDate(cell, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    return cell === null || cell === undefined ? "" : cell;
  }));
}

// კითხულობს კატეგორიებს და ლოკაციებს SETTINGS ფურცლიდან
function getDropdownOptions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('SETTINGS');
  
  // დამცავი მექანიზმი, თუ ფურცელი ვერ იპოვა
  if (!settingsSheet) return { categories: [], locations: [] }; 
  
  const data = settingsSheet.getDataRange().getValues();
  let cats = [];
  let locs = [];
  
  // ციკლს ვიწყებთ 1-დან, რომ პირველი ხაზი (სათაურები) გამოვტოვოთ
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) cats.push(String(data[i][0]).trim()); // A სვეტი
    if (data[i][1]) locs.push(String(data[i][1]).trim()); // B სვეტი
  }
  
  return { categories: cats, locations: locs };
}

function logHistory(action, itemId, itemName, fromLoc, toLoc, qty, responsible, message) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(HISTORY_SHEET);
  sheet.appendRow([new Date(), itemId, itemName, action, fromLoc, toLoc, qty, responsible, message]);
}

function logError(itemId, fromLoc, toLoc, qty, responsible, message) {
  // აქაც 8 არგუმენტი უნდა გადაეცეს (itemName-ის ნაცვლად 'ERROR-LOG')
  logHistory('ERROR', itemId, 'ERROR-LOG', fromLoc, toLoc, qty, responsible, message);
}


function autoBackupSystem() {
  // 1. ჩაწერე აქ შენი ფოლდერის ID
  const folderId = "164eLkbKwXjEE_MbXaOH0oO6SVjXhlHbq"; 
  const folder = DriveApp.getFolderById(folderId);
  
  // 2. აიღე მიმდინარე ფაილი
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fileName = ss.getName();
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  // 3. შექმენი ასლი ფოლდერში
  const backupFile = DriveApp.getFileById(ss.getId()).makeCopy(fileName + "_Backup_" + date, folder);
  
  console.log("Backup Created: " + backupFile.getName());
}

/****
 * add item html-დან
 */

function addNewItem(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbSheet = ss.getSheetByName(DB_SHEET);
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000); // 10 წამი ველოდებით, რომ სხვამ არ ჩაწეროს ამ დროს
    
    // 1. ვაგენერირებთ ახალ ID-ს
    const newId = 'ITM-' + Utilities.getUuid().split('-')[0].toUpperCase();
    const timestamp = new Date();
    
    // 2. ვამზადებთ ახალ რიგს ITEMS_DB-სთვის (სვეტების თანმიმდევრობის ზუსტი დაცვით)
    const newRow = [
      timestamp,          // A: Timestamp
      newId,              // B: Item ID
      data.name,          // C: Name
      data.category,      // D: Category
      data.qty,           // E: Quantity
      data.location,      // F: Location
      data.warranty,      // G: Warranty Deadline
      data.pic,           // H: Picture
      data.notes          // I: Notes
    ];
    
    // 3. ვამატებთ მთავარ ბაზაში
    dbSheet.appendRow(newRow);
    
    // 4. ვამატებთ ისტორიაში (ვიყენებთ შენს არსებულ ფუნქციას)
    const noteForHistory = data.notes ? data.notes : '🚫📝  NO TXT  🚫📝';
    logHistory('ADD', newId, data.name, 'N/A', data.location, data.qty, 'SYSTEM', noteForHistory);
    
    return { success: true, message: "ნივთი წარმატებით დაემატა: " + newId };
    
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * trasnfer from html
 */

function transferItem(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = ss.getSheetByName(DB_SHEET);
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    
    const itemId = data.itemId;
    const action = data.action.toUpperCase(); // TRANSFER, ISSUE, WRITE-OFF, RESTOCK ან UPDATE
    const qty = Number(data.qty);
    const fromLoc = data.fromLoc;
    const toLoc = (action === 'TRANSFER') ? data.toLoc : 'N/A';
    const resp = data.resp || 'UNKNOWN';
    const note = data.note || '';

    const dbValues = db.getDataRange().getValues();
    let sourceRow = -1;
    let targetRow = -1;

    // ვეძებთ ნივთს გამგზავნ ლოკაციაზე
    for (let i = 1; i < dbValues.length; i++) {
      if (dbValues[i][1] === itemId && dbValues[i][5] === fromLoc) sourceRow = i;
      if (action === 'TRANSFER' && dbValues[i][1] === itemId && dbValues[i][5] === toLoc) targetRow = i;
    }

    if (sourceRow === -1) {
      logError(itemId, fromLoc, toLoc, qty, resp, 'Source not found');
      return { success: false, message: "შეცდომა: ნივთი ლოკაციაზე (" + fromLoc + ") არ მოიძებნა!" };
    }

    let itemName = dbValues[sourceRow][2]; 
    const currentQty = Number(dbValues[sourceRow][4]);

    // 🔴 ახალი: თუ უბრალოდ ვაფდეითებთ (UPDATE)
    if (action === 'UPDATE') {
      db.getRange(sourceRow + 1, 9).setValue(note); // ვაახლებთ მხოლოდ Notes (I სვეტი)
      logHistory('UPDATE', itemId, itemName, fromLoc, fromLoc, 0, resp, note);
      return { success: true, message: `✅ ნივთის ინფორმაცია განახლდა!` };
    }

    // 🔴 თუ მარაგს ვავსებთ (RESTOCK)
    if (action === 'RESTOCK') {
      db.getRange(sourceRow + 1, 5).setValue(currentQty + qty); 
      // შეგვიძლია ნოუთიც განვაახლოთ დამატებისას
      if(note) db.getRange(sourceRow + 1, 9).setValue(note);
      logHistory('RESTOCK', itemId, itemName, 'SUPPLIER/NEW', fromLoc, qty, resp, note);
      return { success: true, message: `✅ მარაგი წარმატებით შეივსო (${qty} ცალი)!` };
    }

    // ძველი ლოგიკა დანარჩენი მოქმედებებისთვის (რომლებიც აკლებენ)
    if (qty > currentQty) {
      return { success: false, message: "შეცდომა: მარაგში არ არის საკმარისი რაოდენობა! (ხელმისაწვდომია: " + currentQty + ")" };
    }

    // 1. თუ ტრანსფერია, ჯერ მიმღებთან ვამატებთ
    if (action === 'TRANSFER') {
      if (targetRow !== -1) {
        const targetQty = Number(dbValues[targetRow][4]);
        db.getRange(targetRow + 1, 5).setValue(targetQty + qty);
      } else {
        const newRow = [
          new Date(), itemId, itemName, dbValues[sourceRow][3], 
          qty, toLoc, dbValues[sourceRow][6], dbValues[sourceRow][7], note
        ];
        db.appendRow(newRow);
      }
    }

    // 2. გამოკლება საწყისი ლოკაციიდან (Transfer, Issue, Write-off)
    const remainingQty = currentQty - qty;
    if (remainingQty === 0) {
      db.deleteRow(sourceRow + 1); // ნული დარჩა - ვშლით
    } else {
      db.getRange(sourceRow + 1, 5).setValue(remainingQty); // უბრალოდ ვაკლებთ
    }

    // 3. ისტორიაში ჩაწერა
    const historyToLoc = (action === 'TRANSFER') ? toLoc : 'REMOVED/CONSUMED';
    logHistory(action, itemId, itemName, fromLoc, historyToLoc, qty, resp, note);

    return { success: true, message: `✅ ოპერაცია (${action}) წარმატებით შესრულდა!` };

  } catch (err) {
    return { success: false, message: "სისტემური შეცდომა: " + err.message };
  } finally {
    lock.releaseLock();
  }
}

// --- Dashboard Statistics ---
function getDashboardData() {
  const ss = SpreadsheetApp.getActive();
  const dbData = ss.getSheetByName(DB_SHEET).getDataRange().getValues().slice(1);
  const historyData = ss.getSheetByName(HISTORY_SHEET).getDataRange().getValues().slice(1);
  
  let totalItems = dbData.length;
  let totalQty = 0;
  let lowStock = 0;
  let expiringWarranties = 0;
  
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);

  dbData.forEach(row => {
    let category = row[3]; // D სვეტი - კატეგორია
    let qty = Number(row[4]); // E სვეტი - რაოდენობა
    let location = row[5]; // F სვეტი - ლოკაცია

    if (!isNaN(qty)) {
      totalQty += qty;
      
      // ლოგიკა: ამოწურვის პირასაა მხოლოდ Consumables კატეგორია, რომელიც არის IT Warehouse-ში და ჩამოსცდა 5-ს
      if (category === 'Consumables' && location === 'IT Warehouse' && qty > 0 && qty <= 5) {
        lowStock++; 
      }
    }
    
    // გარანტიის შემოწმება
    let warrantyDate = row[6];
    if (warrantyDate && warrantyDate instanceof Date) {
      if (warrantyDate <= nextMonth) expiringWarranties++;
    }
  });

  // ვიღებთ ბოლო 10 მოქმედებას სრული ინფორმაციით
    const recentHistory = historyData.reverse().slice(0, 10).map(row => {
      return {
        date: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "MMM dd, HH:mm"),
        itemId: row[1],
        item: row[2],
        action: row[3],
        from: row[4],
        to: row[5],
        qty: row[6],
        user: row[7],
        note: row[8] || '-'
      };
    });

    return {
      totalItems: totalItems,
      totalQty: totalQty,
      lowStock: lowStock,
      expiringWarranties: expiringWarranties,
      recentHistory: recentHistory
    };
}


// ========================================================
// 🌐 API ROUTER: გარე საიტიდან შემოსული მოთხოვნების მართვა
// ========================================================
const SECRET_PIN = "qball0409"; // 👈 აქ დაწერე შენი საიდუმლო პაროლი!

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action; 
    const payload = request.payload; 
    const incomingPin = request.pin; // 👈 ვიჭერთ საიტიდან გამოგზავნილ პაროლს
    
    // 🔒 უსაფრთხოების შემოწმება (ბოქლომი)
    if (incomingPin !== SECRET_PIN) {
      throw new Error("წვდომა დაბლოკილია! არასწორი PIN კოდი.");
    }
    
    let result = {};

    switch (action) {
      case "GET_DROPDOWNS": result = getDropdownOptions(); break;
      case "GET_DASHBOARD": result = getDashboardData(); break;
      case "SEARCH_ITEMS": result = searchItems(payload); break;
      case "ADD_ITEM": result = addNewItem(payload); break;
      case "TRANSFER_ITEM": result = transferItem(payload); break;
      case "GET_HISTORY": result = getHistory(); break;
      default: throw new Error("უცნობი ბრძანება (Action): " + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}