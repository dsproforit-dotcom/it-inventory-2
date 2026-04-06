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
  if (filters.special === 'lowStockIT') {
    results = results.filter(r => r[3] === 'Consumables' && r[5] === 'IT Warehouse' && Number(r[4]) > 0 && Number(r[4]) <= 3);
  }
  if (filters.special === 'lowStockFloor') {
    results = results.filter(r => r[3] === 'Consumables' && r[5] === "Floor's Cabinet" && Number(r[4]) > 0 && Number(r[4]) <= 1);
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

// ახალი ფუნქცია: ისტორიის სრულად წამოღება (ლიმიტის გარეშე)
function getHistory() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(HISTORY_SHEET);
  const data = sheet.getDataRange().getValues().slice(1);

  // reverse() ვაკეთებთ, რომ ახალი ჩანაწერები ზემოთ მოექცეს.
  // ძველი .slice(0, 100) წავშალეთ, ახლა მოაქვს აბსოლუტურად ყველაფერი!
  return formatData(data.reverse());
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
    lock.waitLock(10000);

    // 🔴 1. ლოგიკა ID-სთვის
    let newId = data.itemId;

    // თუ ველი ცარიელია, ვაგენერირებთ ავტომატურად
    if (!newId || newId.trim() === "") {
      newId = 'ITM-' + Utilities.getUuid().split('-')[0].toUpperCase();
    } else {
      // თუ ხელით ჩაწერეს, ვამოწმებთ ხომ არ არსებობს უკვე ბაზაში
      const existingIds = dbSheet.getRange("B:B").getValues().flat();
      if (existingIds.includes(newId)) {
        throw new Error("ეს ID უკვე არსებობს ბაზაში! გთხოვთ მიუთითოთ სხვა, ან დატოვეთ ველი ცარიელი.");
      }
    }

    const timestamp = new Date();

    // 2. ვამზადებთ ახალ რიგს
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

    // 4. ვამატებთ ისტორიაში
    const noteForHistory = data.notes ? data.notes : '🚫📝  NO TXT  🚫📝';
    logHistory('ADD', newId, data.name, 'N/A', data.location, data.qty, data.resp || 'UNKNOWN', noteForHistory);

    sendTelegramMessage(
      `➕ <b>NEW ITEM ADDED</b>\n` +
      `📦 <b>${data.name}</b> [${newId}]\n` +
      `📍 Location: ${data.location}\n` +
      `🔢 Quantity: ${data.qty}\n` +
      `👤 By: ${data.resp || 'UNKNOWN'}`
    );
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
      if (note) db.getRange(sourceRow + 1, 9).setValue(note);
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
    // 🔴 რიგის წაშლის ლოგიკა ამოვიღეთ. ახლა თუნდაც 0 დარჩეს, უბრალოდ ვააფდეითებთ რიცხვს:
    db.getRange(sourceRow + 1, 5).setValue(remainingQty);

    // 3. ისტორიაში ჩაწერა
    const historyToLoc = (action === 'TRANSFER') ? toLoc : 'REMOVED/CONSUMED';
    logHistory(action, itemId, itemName, fromLoc, historyToLoc, qty, resp, note);

    const emoji = { TRANSFER: '🔄', ISSUE: '📤', 'WRITE-OFF': '🗑️', RESTOCK: '📥', UPDATE: '✏️' };
    sendTelegramMessage(
      `${emoji[action] || '📋'} <b>${action}</b>\n` +
      `📦 <b>${itemName}</b> [${itemId}]\n` +
      `📍 ${fromLoc}${action === 'TRANSFER' ? ` ➔ ${toLoc}` : ''}\n` +
      `🔢 Quantity: ${qty}\n` +
      `👤 By: ${resp}`
    );
    return { success: true, message: `✅ ოპერაცია (${action}) წარმატებით შესრულდა!` };

  } catch (err) {
    return { success: false, message: "სისტემური შეცდომა: " + err.message };
  } finally {
    lock.releaseLock();
  }
}


// --- Dashboard Statistics ---
function getDashboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbData = ss.getSheetByName(DB_SHEET).getDataRange().getValues().slice(1);
  const historyData = ss.getSheetByName(HISTORY_SHEET).getDataRange().getValues().slice(1);

  let totalItems = dbData.length;
  let totalQty = 0;
  let lowStockIT = 0;      // 👈 IT საწყობისთვის
  let lowStockFloor = 0;   // 👈 სართულების კარადისთვის
  let expiringWarranties = 0;

  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);

  dbData.forEach(row => {
    let category = row[3];
    let qty = Number(row[4]);
    let location = row[5];

    if (!isNaN(qty)) {
      totalQty += qty;


      // 💡 ამოწურვის პირას მყოფი ნივთების დათვლა ლოკაციების მიხედვით
      if (category === 'Consumables' && qty >= 0) { // 👈 აქ შევცვალეთ >= 0
        // IT საწყობში ლიმიტი არის 3
        if (location === 'IT Warehouse' && qty <= 3) {
          lowStockIT++;
        }
        // სართულის კარადაში ლიმიტი არის 1 (ანუ 2-ზე ნაკლები)
        else if (location === "Floor's Cabinet" && qty <= 1) {
          lowStockFloor++;
        }
      }
    }
    if (row[6] && row[6] instanceof Date && row[6] <= nextMonth) expiringWarranties++;
  });

  const recentHistory = [...historyData].reverse().slice(0, 10).map(row => {
    return {
      date: Utilities.formatDate(new Date(row[0]), Session.getScriptTimeZone(), "MMM dd, HH:mm"),
      itemId: row[1], item: row[2], action: row[3], from: row[4], to: row[5], qty: row[6], user: row[7], note: row[8] || '-'
    };
  });

  return {
    totalItems: totalItems,
    totalQty: totalQty,
    lowStockIT: lowStockIT,       // 👈 ვაბრუნებთ ცალკე
    lowStockFloor: lowStockFloor, // 👈 ვაბრუნებთ ცალკე
    expiringWarranties: expiringWarranties,
    recentHistory: recentHistory
  };
}


// ========================================================
// 🌐 API ROUTER: გარე საიტიდან შემოსული მოთხოვნების მართვა
// ========================================================
const SECRET_PIN = PropertiesService.getScriptProperties().getProperty('INVENTORY_PIN'); // 👈 აქ დაწერე შენი საიდუმლო პაროლი!

function doPost(e) {
  try {
    // თუ e.postData არ არის - ცარიელი პასუხი დავაბრუნოთ
    if (!e || !e.postData) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const request = JSON.parse(e.postData.contents);

    // ტელეგრამიდან შემოსული მოთხოვნა - message ველი მხოლოდ ტელეგრამს აქვს
    if (request.message) {
      return handleTelegramCommand(request.message);
    }

    // ჩვეულებრივი საიტიდან შემოსული მოთხოვნა
    const action = request.action;
    const payload = request.payload;
    const incomingPin = request.pin;

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
      case "EDIT_ITEM": result = editExistingItem(payload); break;     // 👈 ახალი
      case "DELETE_ITEM": result = deleteItemDirectly(payload); break; // 👈 ახალი
      default: throw new Error("უცნობი ბრძანება (Action): " + action);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/****
 * ✏️ EDIT ITEM
 */
function editExistingItem(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = ss.getSheetByName(DB_SHEET);
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const itemId = data.itemId;
    const oldLocation = data.oldLocation; // 👈 ვიჭერთ ძველ ლოკაციას
    const dbValues = db.getDataRange().getValues();

    let targetRowIndex = -1;

    // ვეძებთ ID-ით და ძველი ლოკაციით ერთდროულად!
    for (let i = 1; i < dbValues.length; i++) {
      if (dbValues[i][1] === itemId && dbValues[i][5] === oldLocation) {
        targetRowIndex = i + 1;
        break;
      }
    }

    if (targetRowIndex === -1) throw new Error("Item not found in the specified location.");

    // ვააფდეითებთ მონაცემებს ამ რიგში
    const range = db.getRange(targetRowIndex, 3, 1, 7);
    range.setValues([[
      data.name, data.category, data.qty, data.location, data.warranty, data.pic, data.notes
    ]]);

    logHistory('UPDATE', itemId, data.name, oldLocation, data.location, data.qty, data.resp || 'UNKNOWN', 'Full Edit via UI');

    sendTelegramMessage(
      `✏️ <b>ITEM EDITED</b>\n` +
      `📦 <b>${data.name}</b> [${itemId}]\n` +
      `📍 Location: ${data.location}\n` +
      `🔢 Quantity: ${data.qty}\n` +
      `👤 By: ${data.resp || 'UNKNOWN'}`
    );
    return { success: true, message: `✅ რიგი განახლდა: ${itemId}` };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}

/****
 * 🗑️ DELETE ITEM
 */
function deleteItemDirectly(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = ss.getSheetByName(DB_SHEET);
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const itemId = data.itemId;
    const location = data.location;
    const dbValues = db.getDataRange().getValues();

    let targetRowIndex = -1;
    let itemName = "UNKNOWN";

    // ვეძებთ ნივთს ID-ით და ლოკაციით, ვინახავთ სახელს და რაოდენობას
    let itemCurrentQty = 0;
    for (let i = 1; i < dbValues.length; i++) {
      if (dbValues[i][1] === itemId && dbValues[i][5] === location) {
        targetRowIndex = i + 1;
        itemName = dbValues[i][2];
        itemCurrentQty = dbValues[i][4];
        break;
      }
    }

    if (targetRowIndex === -1) throw new Error("Item not found or location mismatch.");

    db.deleteRow(targetRowIndex);

    // წაშლა ყოველთვის მთლიანი ჩანაწერის მოცილებაა - ისტორიაში ვინახავთ რამდენიც იყო
    logHistory('DELETE', itemId, itemName, location, 'DELETED', itemCurrentQty, data.resp || 'UNKNOWN', 'Full record deleted via UI');

    sendTelegramMessage(
      `🗑️ <b>ITEM DELETED</b>\n` +
      `📦 <b>${itemName}</b> [${itemId}]\n` +
      `📍 Was at: ${location}\n` +
      `👤 By: ${data.resp || 'UNKNOWN'}`
    );
    return { success: true, message: `🗑️ რიგი წაიშალა: ${itemId}` };
  } catch (error) {
    return { success: false, message: error.message };
  } finally {
    lock.releaseLock();
  }
}



// =========================================================
// 🤖 TELEGRAM NOTIFICATIONS
// =========================================================
// chatId პარამეტრი სურვილისამებრია - თუ არ მიეწოდება, default chat_id გამოიყენება
function sendTelegramMessage(text, chatId = null) {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
  if (!chatId) chatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');

  if (!token || !chatId) return;

  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    console.error("Telegram error: " + e.message);
  }
}



// =========================================================
// 🤖 TELEGRAM BOT COMMAND HANDLER
// =========================================================
function handleTelegramCommand(message) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const parts = text.split(' ');
  const command = parts[0].toLowerCase().split('@')[0];
  const args = parts.slice(1).join(' ').toLowerCase().trim();

  let replyText = '';

  if (command === '/start' || command === '/help') {
    // დახმარების მენიუ
    replyText =
      `🤖 <b>IT Inventory Bot</b>\n\n` +
      `Available commands:\n\n` +
      `🔍 /stock [keyword] — search item quantity\n` +
      `⚠️ /low — all low stock items\n` +
      `📜 /history — last 10 operations\n` +
      `📊 /summary — inventory overview`;

  } else if (command === '/stock') {
    // ნივთის მოძებნა და რაოდენობის ჩვენება
    if (!args) {
      replyText = '❌ Please provide a keyword.\nExample: /stock cable';
    } else {
      const db = SpreadsheetApp.getActive().getSheetByName(DB_SHEET);
      const rows = db.getDataRange().getValues().slice(1);
      const found = rows.filter(r =>
        String(r[2]).toLowerCase().includes(args) ||
        String(r[1]).toLowerCase().includes(args)
      );

      if (found.length === 0) {
        replyText = `🔍 No items found for: <b>${args}</b>`;
      } else {
        replyText = `🔍 Results for: <b>${args}</b>\n\n`;
        found.forEach(r => {
          const qty = Number(r[4]);
          const qtyEmoji = qty <= 1 ? '🔴' : qty <= 3 ? '🟡' : '🟢';
          replyText += `${qtyEmoji} <b>${r[2]}</b> [${r[1]}]\n`;
          replyText += `   📍 ${r[5]} — Qty: <b>${qty}</b>\n\n`;
        });
      }
    }

  } else if (command === '/low') {
    // low stock ნივთების სია
    const db = SpreadsheetApp.getActive().getSheetByName(DB_SHEET);
    const rows = db.getDataRange().getValues().slice(1);
    const lowIT = rows.filter(r => r[3] === 'Consumables' && r[5] === 'IT Warehouse' && Number(r[4]) <= 3);
    const lowFloor = rows.filter(r => r[3] === 'Consumables' && r[5] === "Floor's Cabinet" && Number(r[4]) <= 1);

    if (lowIT.length === 0 && lowFloor.length === 0) {
      replyText = '✅ All stock levels are OK!';
    } else {
      replyText = '⚠️ <b>Low Stock Alert</b>\n\n';
      if (lowIT.length > 0) {
        replyText += '🏭 <b>IT Warehouse (≤3):</b>\n';
        lowIT.forEach(r => replyText += `  🔴 ${r[2]} — <b>${r[4]}</b> left\n`);
        replyText += '\n';
      }
      if (lowFloor.length > 0) {
        replyText += `🏢 <b>Floor's Cabinet (≤1):</b>\n`;
        lowFloor.forEach(r => replyText += `  🔴 ${r[2]} — <b>${r[4]}</b> left\n`);
      }
    }

  } else if (command === '/history') {
    // ბოლო 10 ოპერაცია
    const sheet = SpreadsheetApp.getActive().getSheetByName(HISTORY_SHEET);
    const rows = sheet.getDataRange().getValues().slice(1).reverse().slice(0, 10);

    replyText = '📜 <b>Last 10 Operations</b>\n\n';
    rows.forEach(r => {
      const date = Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), "MMM dd, HH:mm");
      replyText += `${date} — <b>${r[3]}</b>\n`;
      replyText += `  📦 ${r[2]} [${r[1]}]\n`;
      replyText += `  👤 ${r[7]}\n\n`;
    });

  } else if (command === '/summary') {
    // მარაგის მიმოხილვა
    const db = SpreadsheetApp.getActive().getSheetByName(DB_SHEET);
    const rows = db.getDataRange().getValues().slice(1);
    const totalItems = rows.length;
    const totalQty = rows.reduce((sum, r) => sum + Number(r[4] || 0), 0);
    const lowCount = rows.filter(r => r[3] === 'Consumables' && Number(r[4]) <= 3).length;

    replyText =
      `📊 <b>Inventory Summary</b>\n\n` +
      `📋 Unique items: <b>${totalItems}</b>\n` +
      `📦 Total quantity: <b>${totalQty}</b>\n` +
      `⚠️ Low stock items: <b>${lowCount}</b>`;

  } else {
    replyText = `❓ Unknown command: ${command}\n\nType /help to see available commands.`;
  }

  // პასუხის გაგზავნა
  sendTelegramMessage(replyText, chatId);

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function setTelegramWebhook() {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
  // პირდაპირ Properties-იდან კითხულობს URL-ს და არა ScriptApp-იდან
  const webAppUrl = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL');

  const response = UrlFetchApp.fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${webAppUrl}`
  );
  console.log(response.getContentText());
}



