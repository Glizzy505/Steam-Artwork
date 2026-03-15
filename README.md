# Steam Artwork Auto-Uploader

A **Chrome extension that automates the process of uploading artwork and
screenshots to Steam profiles**.\
The extension slices large artwork images into multiple parts and
sequentially uploads them to Steam using automated form interaction and
asynchronous upload requests.

This tool simplifies the creation of **Steam profile artwork
showcases**, eliminating repetitive manual uploads and significantly
reducing the time required to publish large artwork grids.

------------------------------------------------------------------------

## Features

### Automatic Artwork Uploading

Automates the Steam artwork and screenshot upload process directly from
the browser.

### Multi-Slice Artwork Handling

Large artwork images are automatically processed into slices and
uploaded sequentially to create full profile artwork displays.

### Automated Form Interaction

Dynamically populates required fields and submits uploads by interacting
with Steam pages through DOM manipulation.

### Asynchronous Upload Pipeline

Uses the Fetch API and async workflows to handle multiple uploads while
maintaining reliability.

### Progress Notifications

Displays upload progress and status notifications directly on the Steam
page.

### Error Handling & Retry Logic

Includes safeguards to retry operations and maintain stability across
dynamic Steam pages.

------------------------------------------------------------------------

## Tech Stack

-   **JavaScript (ES6+)**
-   **Chrome Extensions API (Manifest V3)**
-   **DOM Manipulation**
-   **Fetch API**
-   **Service Workers**
-   **Chrome Storage API**

------------------------------------------------------------------------

## How It Works

1.  The extension processes artwork images and prepares them as
    uploadable slices.
2.  Content scripts interact with Steam upload pages.
3.  Each artwork slice is converted into a file object and submitted
    through automated form requests.
4.  Uploads occur sequentially while the extension tracks progress
    through background messaging.
5.  Once all slices are uploaded, the extension redirects the user to
    their artwork or screenshot page.

------------------------------------------------------------------------

## Installation

1.  Clone this repository:

```{=html}
<!-- -->
```
    git clone https://github.com/YOUR_USERNAME/steam-artwork-auto-uploader.git

2.  Open Chrome and go to:

```{=html}
<!-- -->
```
    chrome://extensions

3.  Enable **Developer Mode**.

4.  Click **Load unpacked** and select the project folder.

------------------------------------------------------------------------

## Use Case

This extension is designed for Steam users who create **custom profile
artwork showcases** and need to upload multiple artwork segments quickly
and efficiently.
