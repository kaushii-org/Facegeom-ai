// ================================================
// FACEGEOM AI — REPORT POPUP AND CHATBOT
// ================================================

// IMPORTANT:
// Add your secure backend URL here after deploying it.
// Never put a private AI API key in this file.
const CHAT_API_URL = "";

const reportOverlay = document.getElementById("finalReport");
const closeReportButton = document.getElementById("closeReport");

const reportTabs = document.querySelectorAll(".report-tab");
const overviewTab = document.getElementById("overviewTab");
const assistantTab = document.getElementById("assistantTab");

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatSend = document.getElementById("chatSend");
const chatStatus = document.getElementById("chatStatus");

let chatHistory = [];


// OPEN AND CLOSE REPORT

function closeFinalReport() {
    reportOverlay.classList.remove("visible");
}

if (closeReportButton) {
    closeReportButton.addEventListener("click", closeFinalReport);
}

if (reportOverlay) {
    reportOverlay.addEventListener("click", event => {
        if (event.target === reportOverlay) {
            closeFinalReport();
        }
    });
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeFinalReport();
    }
});


// REPORT TABS

reportTabs.forEach(button => {
    button.addEventListener("click", () => {

        const selectedTab = button.dataset.tab;

        reportTabs.forEach(tab => {
            tab.classList.remove("active");
        });

        button.classList.add("active");

        overviewTab.classList.toggle(
            "active",
            selectedTab === "overview"
        );

        assistantTab.classList.toggle(
            "active",
            selectedTab === "assistant"
        );
    });
});


// CHAT MESSAGE DISPLAY

function addChatMessage(message, sender) {

    const messageBox = document.createElement("div");

    messageBox.className =
        sender === "user"
            ? "chat-message user-message"
            : "chat-message assistant-message";

    const heading = document.createElement("strong");
    heading.textContent =
        sender === "user" ? "YOU" : "FACEGEOM AI";

    const paragraph = document.createElement("p");
    paragraph.textContent = message;

    messageBox.appendChild(heading);
    messageBox.appendChild(paragraph);

    chatMessages.appendChild(messageBox);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}


// GET ACTUAL SCAN DATA

function getChatScanContext() {

    return {
        faceShape: document.getElementById("finalFaceShape").textContent,
        symmetry: document.getElementById("finalSymmetry").textContent,
        harmony: document.getElementById("finalHarmony").textContent,
        faceRatio: document.getElementById("finalRatio").textContent,
        faceWidth: document.getElementById("finalWidth").textContent,
        faceHeight: document.getElementById("finalHeight").textContent,
        eyeSpacing: document.getElementById("finalEyeSpacing").textContent,
        jawProportion: document.getElementById("finalJaw").textContent,
        observations: document.getElementById("finalObservation").textContent,
        styleSuggestions: document.getElementById("finalSuggestions").textContent
    };
}


// SEND MESSAGE TO AI BACKEND

async function sendChatMessage(message) {

    if (!message.trim()) return;

    addChatMessage(message, "user");

    chatHistory.push({
        role: "user",
        content: message
    });

    chatInput.value = "";
    chatInput.disabled = true;
    chatSend.disabled = true;
    chatStatus.textContent = "Preparing your response...";

    if (!CHAT_API_URL) {

        addChatMessage(
            "The chatbot interface is ready, but its AI service has not been connected yet. A secure backend endpoint must be configured before I can provide AI-generated answers.",
            "assistant"
        );

        chatHistory.pop();

        chatInput.disabled = false;
        chatSend.disabled = false;
        chatStatus.textContent =
            "AI service not connected. Backend setup is required.";

        return;
    }

    try {

        const response = await fetch(CHAT_API_URL, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                message: message,
                context: getChatScanContext(),
                history: chatHistory.slice(-10)
            })
        });

        if (!response.ok) {
            throw new Error("AI service returned an error.");
        }

        const data = await response.json();

        if (!data.reply) {
            throw new Error("The AI service returned an empty response.");
        }

        addChatMessage(data.reply, "assistant");

        chatHistory.push({
            role: "assistant",
            content: data.reply
        });

        chatStatus.textContent = "AI assistant connected.";

    } catch (error) {

        console.error("Chatbot error:", error);

        addChatMessage(
            "I couldn't connect to the AI service. Please try again later.",
            "assistant"
        );

        chatStatus.textContent = "Connection error.";

    } finally {

        chatInput.disabled = false;
        chatSend.disabled = false;
        chatInput.focus();
    }
}


// CHAT FORM

if (chatForm) {

    chatForm.addEventListener("submit", event => {

        event.preventDefault();

        const message = chatInput.value.trim();

        if (message) {
            sendChatMessage(message);
        }
    });
}


// QUICK SUGGESTION BUTTONS

document.querySelectorAll(".chat-prompt").forEach(button => {

    button.addEventListener("click", () => {

        const message = button.textContent.trim();

        chatInput.value = message;

        sendChatMessage(message);
    });
});
