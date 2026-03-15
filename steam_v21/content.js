// Steam Artwork Auto-Uploader - content.js

function checkAndUpload(attempt) {
  attempt = attempt || 1;
  chrome.runtime.sendMessage({ action: 'getUploadData' }, function(response) {
    if (chrome.runtime.lastError || !response || !response.data) {
      if (attempt < 8) {
        setTimeout(function() { checkAndUpload(attempt + 1); }, 1000);
      } else {
        showNotification('No upload data found. Try again.', true);
      }
      return;
    }

    var slices = response.data.slices;
    var meta = response.data.meta;

    if (!slices || !slices.length || !meta || !meta.autoUpload) {
      if (attempt < 8) {
        setTimeout(function() { checkAndUpload(attempt + 1); }, 1000);
      } else {
        showNotification('No upload data found. Try again.', true);
      }
      return;
    }

    var currentSlice = meta.currentSlice || 0;
    showNotification('Loaded ' + slices.length + ' slices. Starting upload...');

    if (meta.isWorkshop) {
      uploadWorkshopSlice(slices, currentSlice, meta);
    } else if (meta.isScreenshot) {
      uploadViaFetch(slices, meta.artworkTitle, false, true, meta);
    } else {
      uploadViaFetch(slices, meta.artworkTitle, false, false, meta);
    }
  });
}

// =============================================================
// WORKSHOP: submit one slice, then redirect back to edititem to do the next
// =============================================================
function uploadWorkshopSlice(slices, sliceIndex, result) {
  var form = document.getElementById('SubmitItemForm');
  if (!form) {
    showNotification('Upload form not found. Are you logged in?', true);
    return;
  }

  var total = slices.length;
  showNotification('Workshop: uploading slice ' + (sliceIndex + 1) + ' of ' + total + '...');

  // Inject file
  var fileInput = form.querySelector('input[type="file"]');
  if (fileInput) {
    var file = base64ToFile(slices[sliceIndex], 'workshop_slice_' + (sliceIndex + 1));
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(e) {
      console.warn('[Steam Uploader] DataTransfer failed:', e);
    }
  }

  // Set required fields
  setField(form, '[name=consumer_app_id]', '480');
  setField(form, '[name=file_type]', '0');
  setField(form, '[name=visibility]', '0');

  var titleInput = form.querySelector('[name=title], #title');
  if (titleInput) titleInput.value = result.artworkTitle + ' - Part ' + (sliceIndex + 1);

  var descInput = form.querySelector('[name=description], textarea');
  if (descInput) descInput.value = 'Part ' + (sliceIndex + 1) + ' of ' + total;

  var agreeBox = form.querySelector('[name=agree_terms]');
  if (agreeBox) agreeBox.checked = true;

  try {
    if (window.$J) {
      window.$J('[name=consumer_app_id]').val(480);
      window.$J('[name=file_type]').val(0);
      window.$J('[name=visibility]').val(0);
      window.$J('[name=title], #title').val(result.artworkTitle + ' - Part ' + (sliceIndex + 1));
      window.$J('[name=agree_terms]').prop('checked', true);
    }
  } catch(e) {}

  var nextSlice = sliceIndex + 1;
  var isLastSlice = nextSlice >= total;

  // Advance the counter in background worker BEFORE submitting
  chrome.runtime.sendMessage({ action: 'updateCurrentSlice', currentSlice: nextSlice }, function() {
    setTimeout(function() {
      // Use fetch so WE control what happens after — don't let Steam redirect us away
      var formData = new FormData(form);
      // Make sure all our field values are in formData too
      formData.set('consumer_app_id', '480');
      formData.set('file_type', '0');
      formData.set('visibility', '0');
      formData.set('title', result.artworkTitle + ' - Part ' + (sliceIndex + 1));
      formData.set('description', 'Part ' + (sliceIndex + 1) + ' of ' + total);
      formData.set('agree_terms', 'on');

      fetch(form.action, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        redirect: 'manual'
      }).then(function() {
        console.log('[Steam Uploader] Slice ' + (sliceIndex + 1) + ' submitted');
        afterSliceUploaded(isLastSlice, total, result);
      }).catch(function(err) {
        // fetch throws on opaqueredirect — that's actually success
        console.log('[Steam Uploader] Slice ' + (sliceIndex + 1) + ' redirect caught (expected):', err.message);
        afterSliceUploaded(isLastSlice, total, result);
      });
    }, 1500);
  });
}

function afterSliceUploaded(isLastSlice, total, result) {
  if (isLastSlice) {
    // All done — clean up and go to workshop
    chrome.runtime.sendMessage({ action: 'clearUploadData' });
    showNotification('All ' + total + ' workshop slices uploaded! ✓');
    setTimeout(function() {
      window.location.href = 'https://steamcommunity.com/my/workshop/';
    }, 2000);
  } else {
    // More slices to go — reload this same page to trigger content.js again
    showNotification('Slice uploaded, loading next...');
    setTimeout(function() {
      window.location.href = 'https://steamcommunity.com/sharedfiles/edititem/767/3/';
    }, 1500);
  }
}

// =============================================================
// ARTWORK / SCREENSHOT: fetch loop (no page reloads needed)
// =============================================================
async function uploadViaFetch(slices, baseTitle, isWorkshop, isScreenshot, result) {
  try {
  showNotification('uploadViaFetch started, slices=' + slices.length);
  await delay(300);

  var form = document.getElementById('SubmitItemForm');
  if (!form) {
    showNotification('Upload form not found. Are you logged in?', true);
    return;
  }
  showNotification('Form found: ' + form.action);
  await delay(300);

  for (var i = 0; i < slices.length; i++) {
    showNotification('Processing slice ' + (i+1) + '/' + slices.length + ' size=' + (slices[i] ? Math.round(slices[i].length/1024)+'KB' : 'NULL'));
    await delay(500);

    var formData = new FormData(form);
    formData.delete('file');
    var file = base64ToFile(slices[i], isScreenshot ? 'screenshot' : ('artwork_slice_' + (i+1)));
    formData.append('file', file, file.name);
    formData.set('title', slices.length > 1 ? (baseTitle + ' - Part ' + (i+1)) : baseTitle);
    formData.set('description', isScreenshot ? '' : 'Part ' + (i+1) + ' of ' + slices.length);
    formData.set('agree_terms', 'on');

    var dims = await getImageDimensions(slices[i]);
    if (isScreenshot) {
      formData.set('file_type', '5');
      formData.set('image_width', String(dims.width));
      formData.set('image_height', String(dims.height));
    } else {
      formData.set('image_width', String(dims.width));
      formData.set('image_height', String(dims.height));
    }
    console.log('[Steam Uploader] Slice ' + (i+1) + ' dims=' + dims.width + 'x' + dims.height + ' formAction=' + form.action);

    try {
      var response = await fetch(form.action, { method: 'POST', body: formData, credentials: 'include', redirect: 'manual' });
      console.log('[Steam Uploader] Slice ' + (i+1) + ' response type=' + response.type + ' status=' + response.status);
      if (response.type !== 'opaqueredirect' && response.status !== 0 && response.status !== 303) {
        // Read the response body to see if Steam gave an error
        try {
          var text = await response.text();
          console.log('[Steam Uploader] Response body:', text.substring(0, 500));
        } catch(re) {}
      }
    } catch(e) {
      console.log('[Steam Uploader] Fetch error (expected if redirect):', e.message);
    }

    await delay(2000);
  }

  chrome.runtime.sendMessage({ action: 'clearUploadData' });

  showNotification('Done! ✓');
  setTimeout(function() {
    window.location.href = isScreenshot
      ? 'https://steamcommunity.com/my/screenshots/'
      : 'https://steamcommunity.com/my/images';
  }, 1500);
  } catch(fatalErr) {
    showNotification('CRASH: ' + fatalErr.message, true);
  }
}

// =============================================================
// Helpers
// =============================================================
function setField(form, selector, value) {
  var el = form.querySelector(selector);
  if (el) el.value = value;
}

function showNotification(text, isError) {
  var existing = document.getElementById('steam_uploader_notif');
  if (existing) existing.remove();
  var n = document.createElement('div');
  n.id = 'steam_uploader_notif';
  n.style.cssText = 'position:fixed;top:20px;right:20px;background:' + (isError ? '#8b3a3a' : '#5c7e10') + ';color:white;padding:15px 20px;border-radius:4px;z-index:99999;font-family:Arial,sans-serif;font-size:15px;box-shadow:0 2px 10px rgba(0,0,0,0.5)';
  n.textContent = text;
  document.body.appendChild(n);
  if (!isError) setTimeout(function() { if (n.parentNode) n.remove(); }, 6000);
}

function delay(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

async function getImageDimensions(base64) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() { resolve({ width: img.width, height: img.height }); };
    img.src = base64;
  });
}

function base64ToFile(dataUrl, filenameBase) {
  var parts = dataUrl.split(',');
  var mime = parts[0].match(/:(.*?);/)[1];
  var bin = atob(parts[1]);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  var ext = mime.includes('gif') ? '.gif' : mime.includes('png') ? '.png' : '.jpg';
  return new File([bytes], filenameBase + ext, { type: mime });
}

// Kick off
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(function() { checkAndUpload(1); }, 800); });
} else {
  setTimeout(function() { checkAndUpload(1); }, 800);
}
