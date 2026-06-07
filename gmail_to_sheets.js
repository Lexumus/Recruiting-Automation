// ============================================================
//  RESUME HIRING AUTOMATION — Google Apps Script
//  Watches Gmail → Saves to Drive → Logs in Google Sheets
// ============================================================
//
//  SETUP INSTRUCTIONS:
//  1. Open script.google.com and create a new project
//  2. Paste this entire file
//  3. Fill in the CONFIG section below
//  4. Run setup() ONCE manually to create sheet headers & labels
//  5. Run processResumeEmails as needed
//
// ============================================================

// ─────────────────────────────────────────────────────────────
//  CONFIG — fill these in before running
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  // Google Sheet ID (from the URL: docs.google.com/spreadsheets/d/SHEET_ID/edit)
  sheetId: 'YOUR_SHEET_ID_HERE',

  // Gmail label applied to emails after processing (created automatically)
  processedLabel: 'Processed/Resumes',

  // Gmail label for emails that couldn't be matched to a position
  unrecognizedLabel: 'Resumes/Unrecognized',

  // File types to treat as resumes (everything else is skipped)
  allowedExtensions: ['pdf', 'doc', 'docx'],

  // If true, rename saved files to a consistent format:
  //   "Position - Sender Name - OriginalFilename.pdf"
  renameFiles: true,

  // Positions and their corresponding Drive folder IDs
  positions: [
    {
      title: 'AI Software Engineer Co-op/Intern (Summer 2026)',
      shortName: 'AI SWE',
      folderId: 'YOUR_DRIVE_FOLDER_ID_HERE',
      tabName: 'AI SWE',
    },
    {
      title: 'Machine Learning Engineer Co-op/Intern (Summer 2026)',
      shortName: 'ML Engineer',
      folderId: 'YOUR_DRIVE_FOLDER_ID_HERE',
      tabName: 'ML Engineer',
    },
    {
      title: 'Data/ML Ops Engineer Co-op/Intern (Summer 2026)',
      shortName: 'Data/ML Ops',
      folderId: 'YOUR_DRIVE_FOLDER_ID_HERE',
      tabName: 'Data/ML Ops',
    },
  ],
};

// ─────────────────────────────────────────────────────────────
//  MAIN FUNCTION
// ─────────────────────────────────────────────────────────────
function processResumeEmails() {
  const processedLabel = getOrCreateLabel(CONFIG.processedLabel);
  const unrecognizedLabel = getOrCreateLabel(CONFIG.unrecognizedLabel);
  const spreadsheet = SpreadsheetApp.openById(CONFIG.sheetId);

  // Search for emails with attachments that haven't been processed yet
  const query = `has:attachment -label:"${CONFIG.processedLabel}" from:oce@rit.edu`;
  const threads = GmailApp.search(query, 0, 50); // process up to 50 threads per run

  Logger.log(`Found ${threads.length} unprocessed thread(s).`);

  threads.forEach(thread => {
    let threadRecognized = false;
    const messages = thread.getMessages();
    Logger.log(`Thread has ${messages.length} messages`);

    messages.forEach(message => {
      const attachments = message.getAttachments();
      if (!attachments.length) return;

      const body = message.getBody().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const subject = message.getSubject();
      const from = message.getFrom();
      const date = message.getDate();
      const senderName = extractSenderName(from, body);

      const position = detectPosition(body + ' ' + subject);

      if (!position) {
        Logger.log(`No position match found for email: "${subject}" from ${from}`);
        return; // will be labeled unrecognized below
      }

      threadRecognized = true;
      const folder = DriveApp.getFolderById(position.folderId);
      const sheet = getOrCreateTab(spreadsheet, position.tabName);
      const summarySheet = getOrCreateTab(spreadsheet, 'All Candidates');

      attachments.forEach(attachment => {
        const ext = getExtension(attachment.getName());
        if (!CONFIG.allowedExtensions.includes(ext.toLowerCase())) {
          Logger.log(`Skipping non-resume attachment: ${attachment.getName()}`);
          return;
        }

        // Check for duplicate (same sender + same filename already in this folder)
        if (isDuplicate(folder, senderName)) {
          Logger.log(`Duplicate detected, skipping: ${attachment.getName()} from ${from}`);
          return;
        }

        // Rename file if configured
        const fileName = CONFIG.renameFiles
          ? sanitizeFileName(`${position.shortName} - ${senderName} - ${attachment.getName()}`)
          : attachment.getName();

        // Save to Drive
        const file = folder.createFile(attachment);
        file.setName(fileName);
        const fileUrl = file.getUrl();

        const hyperlink = `=HYPERLINK("${fileUrl}","Open Resume")`;
        const rowData = [
          Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
          senderName,
          from,
          subject,
          position.title,
          fileName,
          hyperlink,
          'New', // default status
        ];

        sheet.appendRow(rowData);
        summarySheet.appendRow(rowData);

        Logger.log(`Saved: ${fileName} → ${position.shortName} folder`);
      });
    });

    // Label the thread as processed
    thread.addLabel(processedLabel);

    // Also mark unrecognized if no position was found in any message
    if (!threadRecognized) {
      thread.addLabel(unrecognizedLabel);
    }
  });

  Logger.log('Run complete.');
}

// ─────────────────────────────────────────────────────────────
//  SETUP FUNCTION  (run once manually)
// ─────────────────────────────────────────────────────────────
function setup() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.sheetId);
  const headers = [
    'Date Received',
    'Candidate Name',
    'Sender Email',
    'Email Subject',
    'Position',
    'File Name',
    'Resume Link',
    'Status',
  ];

  // Create All Candidates summary tab
  const summaryTab = getOrCreateTab(spreadsheet, 'All Candidates');
  if (summaryTab.getLastRow() === 0) {
    formatHeaderRow(summaryTab, headers);
  }

  // Create one tab per position
  CONFIG.positions.forEach(pos => {
    const tab = getOrCreateTab(spreadsheet, pos.tabName);
    if (tab.getLastRow() === 0) {
      formatHeaderRow(tab, headers);
    }
  });

  // Create Gmail labels
  getOrCreateLabel(CONFIG.processedLabel);
  getOrCreateLabel(CONFIG.unrecognizedLabel);

  Logger.log('Setup complete. You can now set up a time-driven trigger on processResumeEmails.');
  SpreadsheetApp.getUi().alert('✅ Setup complete!\n\nSheet tabs and Gmail labels created.\n\nNext: Add a time-driven trigger on processResumeEmails (every 5–10 minutes).');
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Detect which position is mentioned in the text
// ─────────────────────────────────────────────────────────────
function detectPosition(text) {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();

  if (normalized.includes('ai software engineer')) {
    return CONFIG.positions[0];
  }
  if (normalized.includes('machine learning engineer')) {
    return CONFIG.positions[1];
  }
  if (normalized.includes('data/ml ops') || normalized.includes('data ml ops')) {
    return CONFIG.positions[2];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Extract sender's display name from "Name <email>"
// ─────────────────────────────────────────────────────────────
function extractSenderName(from, body) {
  // Extract candidate name from "FirstName LastName with email..."
  const match = body.match(/Dear\s+\S+:\s+([A-Za-z]+(?: [A-Za-z]+)+)\s+with email/);
  if (match) return match[1].trim();
  // Fallback
  const emailMatch = from.match(/([^@<\s]+)@/);
  return emailMatch ? emailMatch[1] : from;
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Get file extension
// ─────────────────────────────────────────────────────────────
function getExtension(filename) {
  return filename.split('.').pop() || '';
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Sanitize file name (remove characters Drive dislikes)
// ─────────────────────────────────────────────────────────────
function sanitizeFileName(name) {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Duplicate detection — check if a file from the same
//          sender already exists in the folder
// ─────────────────────────────────────────────────────────────
function isDuplicate(folder, candidateName) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const fname = files.next().getName();
    if (fname.includes(candidateName)) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Get or create a Gmail label
// ─────────────────────────────────────────────────────────────
function getOrCreateLabel(labelName) {
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
    Logger.log(`Created Gmail label: ${labelName}`);
  }
  return label;
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Get or create a sheet tab by name
// ─────────────────────────────────────────────────────────────
function getOrCreateTab(spreadsheet, tabName) {
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(tabName);
    Logger.log(`Created sheet tab: ${tabName}`);
  }
  return sheet;
}

// ─────────────────────────────────────────────────────────────
//  HELPER: Format the header row with bold + background color
// ─────────────────────────────────────────────────────────────
function formatHeaderRow(sheet, headers) {
  sheet.appendRow(headers);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontSize(11);
  sheet.setFrozenRows(1);

  // Auto-resize columns
  for (let i = 1; i <= headers.length; i++) {
    sheet.setColumnWidth(i, i === 7 ? 130 : 180); // Resume Link column narrower
  }
}

// ─────────────────────────────────────────────────────────────
//  Reset Script Function
// ─────────────────────────────────────────────────────────────
function resetEverything() {
  // Remove processed labels from all emails
  const processedLabel = GmailApp.getUserLabelByName(CONFIG.processedLabel);
  const unrecognizedLabel = GmailApp.getUserLabelByName(CONFIG.unrecognizedLabel);

  const threads = GmailApp.search('from:oce@rit.edu has:attachment', 0, 50);
  threads.forEach(thread => {
    if (processedLabel) thread.removeLabel(processedLabel);
    if (unrecognizedLabel) thread.removeLabel(unrecognizedLabel);
  });
  Logger.log(`Reset labels on ${threads.length} threads`);

  // Delete all files in each Drive folder
  CONFIG.positions.forEach(pos => {
    const folder = DriveApp.getFolderById(pos.folderId);
    const files = folder.getFiles();
    let count = 0;
    while (files.hasNext()) {
      files.next().setTrashed(true);
      count++;
    }
    Logger.log(`Deleted ${count} file(s) from ${pos.shortName} folder`);
  });

  Logger.log('Reset complete. Now run processResumeEmails.');
}
