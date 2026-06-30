/**
 * HEEMAH JEWELRY — Sales Logger (Google Apps Script)
 *
 * SETUP:
 * 1. Create a Google Sheet for your sales log. In row 1, add these
 *    headers (exact order recommended, but the script writes by name
 *    so order doesn't actually matter as long as the headers exist):
 *      Date | Order ID | Reference | Customer Name | Email | Phone |
 *      WhatsApp | Address | Items | Total | Raw JSON
 * 2. In that Sheet, go to Extensions -> Apps Script, delete the
 *    placeholder code, and paste this file's contents in.
 * 3. Set SHARED_SECRET below to a long random string — use the SAME
 *    value as GOOGLE_SCRIPT_SHARED_SECRET in the backend's .env. This
 *    stops random people from posting fake rows into your sheet.
 * 4. Click Deploy -> New deployment -> type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Deploy, authorize the requested permissions, and copy the
 *    resulting URL (ends in /exec).
 * 5. Paste that URL into the backend's GOOGLE_SCRIPT_URL env var.
 */

var SHARED_SECRET = "REPLACE_WITH_THE_SAME_SECRET_AS_BACKEND_ENV";

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (!payload.secret || payload.secret !== SHARED_SECRET) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, message: "Invalid secret." })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    var itemsSummary = (payload.items || [])
      .map(function (i) {
        return i.quantity + "x " + i.name + " (₦" + i.lineTotal + ")";
      })
      .join("; ");

    sheet.appendRow([
      payload.date || new Date().toISOString(),
      payload.orderId || "",
      payload.reference || "",
      payload.customerName || "",
      payload.customerEmail || "",
      payload.customerPhone || "",
      payload.whatsapp || "",
      payload.address || "",
      itemsSummary,
      payload.total || 0,
      JSON.stringify(payload),
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ success: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Optional: lets you sanity-check the deployment by visiting the /exec
 * URL directly in a browser (a GET request, vs the backend's POST).
 */
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "Heemah Jewelry sales logger is running." })
  ).setMimeType(ContentService.MimeType.JSON);
}
