// === popup.js (COMPLETE FILE WITH PROPER GIF ENCODER) ===

const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const status = document.getElementById('status');
const artworkTitle = document.getElementById('artworkTitle');
const debugBtn = document.getElementById('debugBtn');
const debugInfo = document.getElementById('debugInfo');
const artworkMode = document.getElementById('artworkMode');
const screenshotMode = document.getElementById('screenshotMode');
const workshopMode = document.getElementById('workshopMode');
const infoText = document.getElementById('infoText');
const sliceCountRow = document.getElementById('sliceCountRow');
const sliceCount5Btn = document.getElementById('sliceCount5');
const sliceCount2Btn = document.getElementById('sliceCount2');

let currentMode = 'artwork'; // 'artwork', 'screenshot', or 'workshop'
let artworkSliceCount = 5; // 2 or 5

// Mode selection handlers
artworkMode.addEventListener('click', () => {
  currentMode = 'artwork';
  artworkMode.style.background = '#66c0f4';
  screenshotMode.style.background = '#4c6b82';
  workshopMode.style.background = '#4c6b82';
  sliceCountRow.style.display = 'flex';
  infoText.textContent = 'Images will be sliced and uploaded automatically. Static and animated GIFs supported!';
});

sliceCount5Btn.addEventListener('click', () => {
  artworkSliceCount = 5;
  sliceCount5Btn.style.background = '#66c0f4';
  sliceCount2Btn.style.background = '#4c6b82';
  infoText.textContent = 'Images will be sliced into 5 equal pieces and uploaded automatically.';
});

sliceCount2Btn.addEventListener('click', () => {
  artworkSliceCount = 2;
  sliceCount2Btn.style.background = '#66c0f4';
  sliceCount5Btn.style.background = '#4c6b82';
  infoText.textContent = 'Images will be sliced into 2 pieces: large left (506x824) + thin right strip (100x824).';
});

screenshotMode.addEventListener('click', () => {
  currentMode = 'screenshot';
  screenshotMode.style.background = '#66c0f4';
  artworkMode.style.background = '#4c6b82';
  workshopMode.style.background = '#4c6b82';
  sliceCountRow.style.display = 'none';
  infoText.textContent = 'Upload a single screenshot to Steam. No slicing - full image uploaded as-is.';
});

workshopMode.addEventListener('click', () => {
  currentMode = 'workshop';
  workshopMode.style.background = '#66c0f4';
  artworkMode.style.background = '#4c6b82';
  screenshotMode.style.background = '#4c6b82';
  sliceCountRow.style.display = 'none';
  infoText.textContent = 'Upload image to Steam Workshop. Sliced into 5 pieces and uploaded as separate items.';
});

// Debug button handler
debugBtn.addEventListener('click', async () => {
  debugInfo.classList.toggle('show');

  if (debugInfo.classList.contains('show')) {
    const storage = await new Promise(resolve => chrome.storage.local.get(null, resolve));

    const info = {
      'Chrome Storage Keys': Object.keys(storage),
      'Total Slices Expected': storage.totalSlices,
      'Use IndexedDB': storage.useIndexedDB,
      'Auto Upload': storage.autoUpload,
      'Is GIF': storage.isGif,
      'Artwork Title': storage.artworkTitle,
      'Last Error': storage.lastError,
      'Error Time': storage.errorTime,
      'Chrome Storage Slices': Object.keys(storage).filter(k => k.startsWith('slice_')).length
    };

    debugInfo.textContent = JSON.stringify(info, null, 2);
  }
});

selectBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  if (!e.target.files.length) return;

  const file = e.target.files[0];

  if (!file.type.startsWith('image/')) {
    showStatus('Please select an image file', 'error');
    return;
  }

  const isGif = file.type === 'image/gif';

  const titleValue = artworkTitle ? artworkTitle.value.trim() : '';
  if (!titleValue) {
    showStatus('Please enter a title for your artwork', 'error');
    return;
  }

  selectBtn.disabled = true;
  showStatus('Processing image...', 'info');

  try {
    if (currentMode === 'screenshot') {
      await processSingleImage(file, titleValue, currentMode);
    } else if (isGif) {
      // GIF in any mode: use animated slicer, pass sliceCount and isWorkshop
      await processAnimatedGif(file, titleValue, currentMode === 'workshop', artworkSliceCount);
    } else {
      // PNG/static in artwork or workshop mode
      await processStaticImage(file, titleValue, currentMode === 'workshop', artworkSliceCount);
    }
  } catch (error) {
    showStatus('Error: ' + error.message, 'error');
    selectBtn.disabled = false;
  }
});

// ================= SINGLE IMAGE (WORKSHOP/SCREENSHOT) =================

async function processSingleImage(file, titleValue, mode) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const imageSrc = event.target.result;

    showStatus(`Preparing ${mode} upload...`, 'success');

    const storageData = {
      artworkTitle: titleValue,
      autoUpload: true,
      totalSlices: 1,
      useIndexedDB: false,
      isWorkshop: mode === 'workshop',
      isScreenshot: mode === 'screenshot',
      slice_0: imageSrc
    };

    saveToIndexedDB([storageData.slice_0], {
      artworkTitle: storageData.artworkTitle,
      autoUpload: storageData.autoUpload,
      totalSlices: storageData.totalSlices,
      currentSlice: 0,
      isWorkshop: storageData.isWorkshop,
      isScreenshot: storageData.isScreenshot
    }, () => {
      showStatus('Opening Steam...', 'success');
      chrome.tabs.create({ url: 'https://steamcommunity.com/sharedfiles/edititem/767/3/' });
      selectBtn.disabled = false;
    }, (err) => {
      showStatus('Save error: ' + err, 'error');
      selectBtn.disabled = false;
    });
  };

  reader.onerror = () => {
    showStatus('Failed to read file', 'error');
    selectBtn.disabled = false;
  };

  reader.readAsDataURL(file);
}

function base64ToFile(dataUrl, filenameBase) {
  const [meta, data] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];

  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const ext = mime.includes('png') ? '.png' : mime.includes('gif') ? '.gif' : '.jpg';
  return new File([bytes], filenameBase + ext, { type: mime });
}

// ================= STATIC ARTWORK (SLICED) =================

async function processStaticImage(file, titleValue, isWorkshop, sliceCount) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const imageSrc = event.target.result;

    const img = new Image();
    img.onload = async () => {
      showStatus('Slicing image...', 'info');

      const slices = [];

      if (sliceCount === 2) {
        // 2-slice mode: 506x824 (left) + 100x824 (right)
        // proportions: 83.498% / 16.502% of total width
        const targetHeight = 824;
        const sliceWidths = [506, 100];
        const totalW = 606;
        let sourceX = 0;

        for (let i = 0; i < 2; i++) {
          const canvas = document.createElement('canvas');
          canvas.width = sliceWidths[i];
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          const sourceWidth = Math.round(img.width * sliceWidths[i] / totalW);

          ctx.drawImage(
            img,
            sourceX, 0, sourceWidth, img.height,
            0, 0, sliceWidths[i], targetHeight
          );
          sourceX += sourceWidth;

          let quality = 0.92;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > 1400000 && quality > 0.5) {
            quality -= 0.05;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          slices.push(dataUrl);
        }
      } else {
        // 5-slice mode (original)
        const numSlices = 5;
        const targetHeight = 1000;
        const aspectRatio = img.width / img.height;
        const targetWidth = Math.round(targetHeight * aspectRatio);
        const sliceWidth = Math.floor(targetWidth / numSlices);

        for (let i = 0; i < numSlices; i++) {
          const canvas = document.createElement('canvas');
          canvas.width = sliceWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          const sourceX = (img.width / numSlices) * i;
          const sourceWidth = img.width / numSlices;

          ctx.drawImage(
            img,
            sourceX, 0, sourceWidth, img.height,
            0, 0, sliceWidth, targetHeight
          );

          let quality = 0.92;
          let dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > 1400000 && quality > 0.5) {
            quality -= 0.05;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          slices.push(dataUrl);
        }
      }

      showStatus(`Created ${slices.length} slices. Saving...`, 'success');

      saveToIndexedDB(slices, {
        artworkTitle: titleValue, autoUpload: true,
        totalSlices: slices.length, currentSlice: 0,
        isWorkshop: !!isWorkshop, isScreenshot: false
      }, () => {
        showStatus('Opening Steam...', 'success');
        chrome.tabs.create({ url: 'https://steamcommunity.com/sharedfiles/edititem/767/3/' });
        selectBtn.disabled = false;
      }, (err) => {
        showStatus('Save error: ' + err, 'error');
        selectBtn.disabled = false;
      });
    };

    img.onerror = () => {
      showStatus('Failed to load image', 'error');
      selectBtn.disabled = false;
    };

    img.src = imageSrc;
  };

  reader.onerror = () => {
    showStatus('Failed to read file', 'error');
    selectBtn.disabled = false;
  };

  reader.readAsDataURL(file);
}

// ================= GIF =================

async function processAnimatedGif(file, titleValue, isWorkshop, sliceCount) {
  showStatus('Processing animated GIF...', 'info');

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const gifData = parseGIF(bytes);

  if (!gifData || gifData.frames.length === 0) {
    throw new Error('Failed to parse GIF or no frames found');
  }

  // Slice layout — mirrors processStaticImage logic
  let numSlices, sliceWidths, sourceSliceWidths;
  const sourceSliceHeight = gifData.height;

  if (sliceCount === 2) {
    // 2-slice mode: 506x824 (left) + 100x824 (right)
    numSlices = 2;
    const totalW = 606;
    sliceWidths = [506, 100];
    sourceSliceWidths = sliceWidths.map(w => Math.round(gifData.width * w / totalW));
  } else {
    // 5-slice mode (original)
    numSlices = 5;
    const targetHeight = 300;
    const aspectRatio = gifData.width / gifData.height;
    const targetWidth = Math.round(targetHeight * aspectRatio);
    const sw = Math.floor(targetWidth / numSlices);
    sliceWidths = Array(5).fill(sw);
    sourceSliceWidths = Array(5).fill(Math.floor(gifData.width / numSlices));
  }

  const targetHeight = sliceCount === 2 ? 824 : 300;

  const sliceCanvases = [];
  for (let i = 0; i < numSlices; i++) sliceCanvases.push([]);

  // Create a temporary canvas for the full frame
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = gifData.width;
  tempCanvas.height = gifData.height;
  const tempCtx = tempCanvas.getContext('2d');

  for (let frameIndex = 0; frameIndex < gifData.frames.length; frameIndex++) {
    const frame = gifData.frames[frameIndex];
    
    // Create ImageData from frame pixels
    const imageData = new ImageData(
      new Uint8ClampedArray(frame.pixels.buffer),
      gifData.width,
      gifData.height
    );
    
    // Clear and draw the full frame
    tempCtx.clearRect(0, 0, gifData.width, gifData.height);
    tempCtx.putImageData(imageData, 0, 0);

    let sourceXOffset = 0;
    for (let sliceIdx = 0; sliceIdx < numSlices; sliceIdx++) {
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = sliceWidths[sliceIdx];
      sliceCanvas.height = targetHeight;
      const sliceCtx = sliceCanvas.getContext('2d');

      const sourceX = sourceXOffset;
      const sourceWidth = sliceIdx === numSlices - 1
        ? gifData.width - sourceX
        : sourceSliceWidths[sliceIdx];
      sourceXOffset += sourceSliceWidths[sliceIdx];

      sliceCtx.drawImage(
        tempCanvas,
        sourceX, 0, sourceWidth, sourceSliceHeight,
        0, 0, sliceWidths[sliceIdx], targetHeight
      );

      sliceCanvases[sliceIdx].push({
        canvas: sliceCanvas,
        delay: frame.delay
      });
    }
  }

  const slices = [];

  for (let i = 0; i < numSlices; i++) {
    showStatus(`Encoding slice ${i + 1}/${numSlices}...`, 'info');
    const gifBlob = await encodeGIF(sliceCanvases[i], sliceWidths[i], targetHeight);
    slices.push(await blobToBase64(gifBlob));
  }

  const storageData = {
    artworkTitle: titleValue,
    autoUpload: true,
    totalSlices: slices.length,
    currentSlice: 0,
    isGif: true,
    isWorkshop: !!isWorkshop
  };

  saveToIndexedDB(slices, storageData, () => {
    showStatus('Opening Steam...', 'success');
    chrome.tabs.create({ url: 'https://steamcommunity.com/sharedfiles/edititem/767/3/' });
    selectBtn.disabled = false;
  }, (err) => {
    showStatus('Save error: ' + err, 'error');
    selectBtn.disabled = false;
  });
}

// ================= GIF PARSER =================

function parseGIF(bytes) {
  const gif = {
    width: 0,
    height: 0,
    frames: []
  };
  
  let pos = 6;
  
  // Read logical screen descriptor
  gif.width = bytes[pos] | (bytes[pos + 1] << 8);
  gif.height = bytes[pos + 2] | (bytes[pos + 3] << 8);
  const packed = bytes[pos + 4];
  const hasGlobalColorTable = (packed & 0x80) !== 0;
  const globalColorTableSize = 2 << (packed & 0x07);
  pos += 7;
  
  // Read global color table if present
  let globalColorTable = null;
  if (hasGlobalColorTable) {
    globalColorTable = [];
    for (let i = 0; i < globalColorTableSize; i++) {
      const r = bytes[pos++];
      const g = bytes[pos++];
      const b = bytes[pos++];
      globalColorTable.push([r, g, b, 255]);
    }
  }
  
  // Initialize canvas
  const canvas = new OffscreenCanvas(gif.width, gif.height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, gif.width, gif.height);
  
  let graphicsControl = null;
  let disposalMethod = 0;
  let transparentIndex = -1;
  let delay = 100;
  
  // Process blocks
  while (pos < bytes.length) {
    const blockType = bytes[pos++];
    
    // Extension block
    if (blockType === 0x21) {
      const extensionLabel = bytes[pos++];
      
      // Graphics Control Extension
      if (extensionLabel === 0xF9) {
        const blockSize = bytes[pos++];
        const packedByte = bytes[pos++];
        delay = (bytes[pos] | (bytes[pos + 1] << 8)) * 10;
        pos += 2;
        transparentIndex = bytes[pos++];
        
        graphicsControl = {
          disposalMethod: (packedByte >> 2) & 0x07,
          delay: delay || 100,
          transparentIndex: (packedByte & 0x01) ? transparentIndex : -1
        };
        
        disposalMethod = graphicsControl.disposalMethod;
        transparentIndex = graphicsControl.transparentIndex;
        
        pos++;
      } else {
        let blockSize = bytes[pos++];
        while (blockSize > 0) {
          pos += blockSize;
          blockSize = bytes[pos++];
        }
      }
    }
    // Image descriptor
    else if (blockType === 0x2C) {
      const left = bytes[pos] | (bytes[pos + 1] << 8);
      const top = bytes[pos + 2] | (bytes[pos + 3] << 8);
      const imgWidth = bytes[pos + 4] | (bytes[pos + 5] << 8);
      const imgHeight = bytes[pos + 6] | (bytes[pos + 7] << 8);
      const packedField = bytes[pos + 8];
      pos += 9;
      
      const localColorTableFlag = (packedField & 0x80) !== 0;
      const interlacedFlag = (packedField & 0x40) !== 0;
      const colorTableSize = 2 << (packedField & 0x07);
      
      // Read local color table if present
      let colorTable = localColorTableFlag ? [] : globalColorTable;
      if (localColorTableFlag) {
        for (let i = 0; i < colorTableSize; i++) {
          const r = bytes[pos++];
          const g = bytes[pos++];
          const b = bytes[pos++];
          colorTable.push([r, g, b, 255]);
        }
      }
      
      // Minimum LZW code size
      const lzwMinCodeSize = bytes[pos++];
      
      // Read image data sub-blocks
      const compressedData = [];
      let subBlockSize = bytes[pos++];
      while (subBlockSize > 0) {
        for (let i = 0; i < subBlockSize; i++) {
          compressedData.push(bytes[pos++]);
        }
        subBlockSize = bytes[pos++];
      }
      
      // Decompress LZW data
      const pixelIndices = decompressLZW(compressedData, lzwMinCodeSize);
      
      // Create image data for this frame
      const imageData = ctx.getImageData(0, 0, gif.width, gif.height);
      const pixels = imageData.data;
      
      if (interlacedFlag) {
        // Interlaced GIF - 4 passes
        const passes = [
          { start: 0, step: 8 },
          { start: 4, step: 8 },
          { start: 2, step: 4 },
          { start: 1, step: 2 }
        ];
        
        let pixelIndex = 0;
        for (const pass of passes) {
          for (let y = pass.start; y < imgHeight; y += pass.step) {
            for (let x = 0; x < imgWidth; x++) {
              if (pixelIndex >= pixelIndices.length) break;
              
              const colorIdx = pixelIndices[pixelIndex++];
              
              if (transparentIndex >= 0 && colorIdx === transparentIndex) {
                continue;
              }
              
              const destX = left + x;
              const destY = top + y;
              
              if (destX >= 0 && destX < gif.width && destY >= 0 && destY < gif.height) {
                const pixelPos = (destY * gif.width + destX) * 4;
                const color = colorTable[colorIdx] || [0, 0, 0, 255];
                
                pixels[pixelPos] = color[0];
                pixels[pixelPos + 1] = color[1];
                pixels[pixelPos + 2] = color[2];
                pixels[pixelPos + 3] = color[3];
              }
            }
          }
        }
      } else {
        // Non-interlaced GIF
        let pixelIndex = 0;
        for (let y = 0; y < imgHeight; y++) {
          for (let x = 0; x < imgWidth; x++) {
            if (pixelIndex >= pixelIndices.length) break;
            
            const colorIdx = pixelIndices[pixelIndex++];
            
            if (transparentIndex >= 0 && colorIdx === transparentIndex) {
              continue;
            }
            
            const destX = left + x;
            const destY = top + y;
            
            if (destX >= 0 && destX < gif.width && destY >= 0 && destY < gif.height) {
              const pixelPos = (destY * gif.width + destX) * 4;
              const color = colorTable[colorIdx] || [0, 0, 0, 255];
              
              pixels[pixelPos] = color[0];
              pixels[pixelPos + 1] = color[1];
              pixels[pixelPos + 2] = color[2];
              pixels[pixelPos + 3] = color[3];
            }
          }
        }
      }
      
      // Put the modified image data back
      ctx.putImageData(imageData, 0, 0);
      
      // Get the current frame pixels
      const framePixels = ctx.getImageData(0, 0, gif.width, gif.height).data;
      gif.frames.push({
        pixels: new Uint8ClampedArray(framePixels),
        delay: delay || 100
      });
      
      // Handle disposal method
      switch (disposalMethod) {
        case 0:
        case 1:
          break;
        case 2:
        case 3:
          ctx.clearRect(left, top, imgWidth, imgHeight);
          break;
      }
      
      graphicsControl = null;
    }
    // Trailer
    else if (blockType === 0x3B) {
      break;
    }
  }
  
  return gif;
}

// ================= LZW DECOMPRESSION =================

function decompressLZW(data, minCodeSize) {
  const output = [];
  
  if (!data || data.length === 0) return output;
  
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  
  let dict = [];
  for (let i = 0; i < clearCode; i++) {
    dict[i] = [i];
  }
  dict[clearCode] = [clearCode];
  dict[eoiCode] = [eoiCode];
  
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  
  let bitPos = 0;
  
  const getCode = () => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const bytePos = Math.floor(bitPos / 8);
      const bitOffset = bitPos % 8;
      
      if (bytePos >= data.length) {
        return -1;
      }
      
      const bit = (data[bytePos] >> bitOffset) & 1;
      code |= bit << i;
      bitPos++;
    }
    return code;
  };
  
  let code = getCode();
  
  if (code === -1 || code === clearCode) {
    code = getCode();
  }
  
  let oldCode = code;
  
  if (code !== -1 && code < dict.length) {
    output.push(...dict[code]);
  }
  
  while (true) {
    code = getCode();
    
    if (code === -1 || code === eoiCode) {
      break;
    }
    
    if (code === clearCode) {
      dict = [];
      for (let i = 0; i < clearCode; i++) {
        dict[i] = [i];
      }
      dict[clearCode] = [clearCode];
      dict[eoiCode] = [eoiCode];
      
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
      
      code = getCode();
      if (code === -1 || code === eoiCode) break;
      
      output.push(...dict[code]);
      oldCode = code;
      continue;
    }
    
    let symbols;
    if (dict[code]) {
      symbols = dict[code];
    } else {
      symbols = dict[oldCode].concat([dict[oldCode][0]]);
    }
    
    output.push(...symbols);
    
    dict[nextCode] = dict[oldCode].concat([symbols[0]]);
    nextCode++;
    
    if (nextCode >= (1 << codeSize) && codeSize < 12) {
      codeSize++;
    }
    
    oldCode = code;
  }
  
  return output;
}

// ================= PROPER GIF ENCODER =================

// ================= PROPER GIF ENCODER WITH PER-SLICE COLOR TABLES =================

async function encodeGIF(frames, width, height) {
  // Helper functions
  function writeByte(arr, v) { arr.push(v & 255); }
  function writeWord(arr, v) { writeByte(arr, v); writeByte(arr, v >> 8); }

  function lzwEncode(indices, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    
    let dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(i.toString(), i);
    
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    
    let bits = [];
    
    function emit(code) {
      for (let i = 0; i < codeSize; i++) {
        bits.push((code >> i) & 1);
      }
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    
    emit(clearCode);
    
    let w = '' + indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const wk = w + ',' + k;
      if (dict.has(wk)) {
        w = wk;
      } else {
        emit(dict.get(w));
        dict.set(wk, nextCode++);
        w = '' + k;
      }
    }
    
    emit(dict.get(w));
    emit(endCode);
    
    // Convert bits to bytes
    const out = [];
    let cur = 0, count = 0;
    for (let b of bits) {
      cur |= b << count;
      count++;
      if (count === 8) {
        out.push(cur);
        cur = 0;
        count = 0;
      }
    }
    if (count > 0) out.push(cur);
    
    return out;
  }

  function canvasToIndexed(canvas, frameIndex) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Create palette from THIS frame's colors only
    const paletteMap = new Map();
    const palette = [];
    const indices = new Uint8Array(width * height);
    
    // Reserve index 0 for transparency (black)
    palette.push([0, 0, 0]);
    
    // Collect unique colors from this frame
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      if (a < 128) {
        indices[p] = 0; // Transparent
        continue;
      }
      
      // Quantize to 6-bit color (64 colors) to reduce palette size
      const qR = Math.floor(r / 64) * 64;
      const qG = Math.floor(g / 64) * 64;
      const qB = Math.floor(b / 64) * 64;
      const colorKey = (qR << 16) | (qG << 8) | qB;
      
      if (!paletteMap.has(colorKey)) {
        if (palette.length < 256) {
          paletteMap.set(colorKey, palette.length);
          palette.push([qR, qG, qB]);
        }
      }
      
      indices[p] = paletteMap.get(colorKey) || 1; // Default to first color if not found
    }
    
    // Ensure we have at least 2 colors
    if (palette.length < 2) {
      palette.push([255, 255, 255]);
    }
    
    // Calculate palette size (power of 2)
    let paletteSize = 2;
    while (paletteSize < palette.length) paletteSize <<= 1;
    
    // Fill palette to required size
    while (palette.length < paletteSize) {
      palette.push([0, 0, 0]);
    }
    
    // Calculate paletteSizeCode (log2(paletteSize) - 1)
    let paletteSizeCode = 0;
    let temp = paletteSize;
    while (temp >>= 1) paletteSizeCode++;
    paletteSizeCode = Math.max(1, paletteSizeCode - 1);
    
    return { palette, indices, paletteSize: paletteSizeCode };
  }

  const bytes = [];
  
  // GIF Header
  bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
  
  // Logical Screen Descriptor - NO GLOBAL COLOR TABLE
  writeWord(bytes, width);
  writeWord(bytes, height);
  bytes.push(0x00); // No global color table
  bytes.push(0x00); // Background color
  bytes.push(0x00); // Pixel aspect ratio
  
  // Netscape Application Extension for looping
  if (frames.length > 1) {
    bytes.push(0x21, 0xFF, 0x0B); // Extension + Label
    bytes.push(...[0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30]); // "NETSCAPE2.0"
    bytes.push(0x03, 0x01); // Block size + sub-block ID
    writeWord(bytes, 0); // Loop forever
    bytes.push(0x00); // Block terminator
  }
  
  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex];
    
    // Graphics Control Extension
    bytes.push(0x21, 0xF9, 0x04); // Extension + Label
    bytes.push(0x00); // No transparency (using color 0)
    writeWord(bytes, Math.max(1, Math.round(frame.delay / 10))); // Delay in 1/100ths sec
    bytes.push(0x00, 0x00); // Transparent color index + terminator
    
    // Convert canvas to indexed colors - EACH FRAME GETS ITS OWN PALETTE
    const { palette, indices, paletteSize } = canvasToIndexed(frame.canvas, frameIndex);
    
    // Image Descriptor
    bytes.push(0x2C); // Image Separator
    writeWord(bytes, 0); // Left
    writeWord(bytes, 0); // Top
    writeWord(bytes, width);
    writeWord(bytes, height);
    
    // Local color table flag + size
    bytes.push(0x80 | paletteSize); // Local color table present, not interlaced
    
    // Write local color table for THIS FRAME
    const actualPaletteSize = 1 << (paletteSize + 1);
    for (let i = 0; i < actualPaletteSize; i++) {
      const color = palette[i] || [0, 0, 0];
      bytes.push(color[0], color[1], color[2]);
    }
    
    // LZW Minimum Code Size
    bytes.push(paletteSize + 1);
    
    // LZW Compressed Data
    const compressed = lzwEncode(indices, paletteSize + 1);
    let pos = 0;
    while (pos < compressed.length) {
      const blockSize = Math.min(255, compressed.length - pos);
      bytes.push(blockSize);
      for (let i = 0; i < blockSize; i++) {
        bytes.push(compressed[pos++]);
      }
    }
    bytes.push(0x00); // Block terminator
  }
  
  // GIF Trailer
  bytes.push(0x3B);
  
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

function blobToBase64(blob) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}


// ================= Storage helper =================
// Sends slice data to background service worker (no quota limits)
function saveToIndexedDB(slices, metadata, onSuccess, onError) {
  chrome.runtime.sendMessage({
    action: 'setUploadData',
    data: { slices: slices, meta: metadata }
  }, function(response) {
    if (chrome.runtime.lastError) {
      onError(chrome.runtime.lastError.message);
    } else if (response && response.ok) {
      onSuccess();
    } else {
      onError('Background worker did not respond');
    }
  });
}

function showStatus(message, type) {
  status.textContent = message;
  status.className = 'status ' + type;
}