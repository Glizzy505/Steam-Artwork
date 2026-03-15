// Background service worker — acts as in-memory relay for image slices
// popup.js writes here, content.js reads from here via messaging
// No quota limits since it's just RAM

var uploadData = null;

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {

  if (msg.action === 'setUploadData') {
    uploadData = msg.data;
    console.log('[BG] Stored upload data, slices:', uploadData.slices.length);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'getUploadData') {
    console.log('[BG] Sending upload data, slices:', uploadData ? uploadData.slices.length : 'null');
    sendResponse({ data: uploadData });
    return true;
  }

  if (msg.action === 'clearUploadData') {
    uploadData = null;
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'updateCurrentSlice') {
    if (uploadData) uploadData.meta.currentSlice = msg.currentSlice;
    sendResponse({ ok: true });
    return true;
  }

});
