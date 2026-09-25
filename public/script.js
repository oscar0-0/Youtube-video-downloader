const urlInput = document.getElementById("url-input");
const fetchBtn = document.getElementById("fetch-btn");
const loading = document.getElementById("loading");
const stepInput = document.getElementById("step-input");
const optionsSection = document.getElementById("options-section");
const qualityGrid = document.getElementById("quality-grid");
const downloadSection = document.getElementById("download-section");
const successSection = document.getElementById("success-section");
const errorSection = document.getElementById("error-section");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const statusMsg = document.getElementById("status-message");
const warningBanner = document.getElementById("warning-banner");
const warningText = document.getElementById("warning-text");
const downloadLink = document.getElementById("download-link");
const errorMessage = document.getElementById("error-message");

function showSection(sectionId) {
    [stepInput, loading, optionsSection, downloadSection, successSection, errorSection].forEach(s => s.classList.add("hidden"));
    document.getElementById(sectionId).classList.remove("hidden");
}

async function checkStatus() {
    try {
        const res = await fetch("/api/status");
        const data = await res.json();
        if (data.missing && data.missing.length > 0) {
            warningText.textContent = "Server is missing: " + data.missing.join(", ");
            warningBanner.classList.remove("hidden");
        }
    } catch (e) {
        console.error("Status check failed", e);
    }
}

async function fetchFormats() {
    const url = urlInput.value.trim();
    if (!url) return alert("Please enter a URL");

    showSection("loading");

    try {
        const res = await fetch(`/api/formats?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);
        
        renderOptions(data.options);
        showSection("options-section");
    } catch (e) {
        errorMessage.textContent = e.message;
        showSection("error-section");
    }
}

function renderOptions(options) {
    qualityGrid.innerHTML = "";
    options.forEach(opt => {
        const icon = opt.quality === "audio" ? "🎵" : "📺";
        const card = document.createElement("button");
        card.className = "quality-card group";
        card.onclick = () => startDownload(opt.quality);
        card.innerHTML = `
            <span class="text-2xl mb-2 block group-hover:scale-110 transition-transform">${icon}</span>
            <span class="block font-bold text-white">${opt.label}</span>
            <span class="text-xs text-slate-500">${opt.size}</span>
        `;
        qualityGrid.appendChild(card);
    });
}

async function startDownload(quality) {
    const url = urlInput.value.trim();
    
    showSection("download-section");
    progressFill.style.width = "0%";
    progressText.textContent = "0%";
    statusMsg.textContent = "Initializing...";

    const eventSource = new EventSource(`/api/download?url=${encodeURIComponent(url)}&quality=${quality}`);

    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "progress") {
            const perc = data.value;
            progressFill.style.width = perc + "%";
            progressText.textContent = perc + "%";
            statusMsg.textContent = "Downloading...";
        } else if (data.type === "error") {
            errorMessage.textContent = data.value;
            showSection("error-section");
            eventSource.close();
        } else if (data.type === "complete") {
            downloadLink.href = data.url;
            showSection("success-section");
            eventSource.close();
        }
    };

    eventSource.onerror = () => {
        errorMessage.textContent = "Connection lost or download failed.";
        showSection("error-section");
        eventSource.close();
    };
}

fetchBtn.addEventListener("click", fetchFormats);
window.startDownload = startDownload;
checkStatus();
