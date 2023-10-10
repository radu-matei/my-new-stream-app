const chatHistory = document.querySelector('.chat-history');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');

const conversationIdKey = "conversationId";

let conversationId = getOrSetConversationId();

(async () => {
	let history = await fetch(`/api/${conversationId}`);
	console.log(`Fetching conversation ID: ${conversationId}`);
	if (history.ok) {
		console.log("ok");
		let chat = await history.json();
		if (chat) {
			chat.prompts.forEach(c => {
				addMessageToChatHistory(c.role, c.content);
			})
			notify("Loaded conversation from history.");
		}
	} else {
		notify("Created new conversation.");
	}
})();


function getOrSetConversationId() {
	let conversationId;
	if (window.localStorage.getItem(conversationIdKey)) {
		conversationId = window.localStorage.getItem(conversationIdKey);
	} else {
		conversationId = uuidv4();
		console.log(`Conversation ID: ${conversationId}`);
		window.localStorage.setItem(conversationIdKey, conversationId);
	}
	return conversationId;
}

// Function to add a new message to the chat history
function addMessageToChatHistory(role, content) {
	if (role == "System") {
		return;
	}
	const msg = content.replace(/^\s+|\s+$/g, '');
	const newMessage = document.createElement('div');
	if (role == "User") {
		newMessage.className = "user-chat-message";
	} else {
		newMessage.className = "assistant-chat-message";
	}
	newMessage.innerText = `${role}: ${msg}`;
	chatHistory.appendChild(newMessage);
	chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Function to add a new message to the chat history with typing animation
function typeMessage(role, content) {
	const msg = content.replace(/^\s+|\s+$/g, '');
	const newMessage = document.createElement('div');
	if (role == "User") {
		newMessage.className = "user-chat-message";
	} else {
		newMessage.className = "assistant-chat-message";
	}
	chatHistory.appendChild(newMessage);

	let i = 0;
	const typingAnimation = setInterval(() => {
		newMessage.innerText = `${role}: ${msg.substring(0, i++)}_`;
		if (i > msg.length) {
			newMessage.innerText = `${role}: ${msg}`;
			clearInterval(typingAnimation);
			chatHistory.scrollTop = chatHistory.scrollHeight;
		}
	}, 30);
}

// Function to handle sending a message to the generation API
async function sendMessageToAPI(id, content) {
	let response = await fetch("/api/generate", { method: "POST", body: JSON.stringify({ id: id, role: "User", content: content }) });
	typeMessage("Assistant", await response.text());
}

// Event listener for send button click
sendButton.addEventListener('click', () => {
	const message = messageInput.value.trim();
	if (message) {
		addMessageToChatHistory('User', message);
		messageInput.value = '';
		console.log(conversationId);
		console.log(message);
		sendMessageToAPI(conversationId, message);
	}
});

// Event listener for enter key press
messageInput.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') {
		const message = messageInput.value.trim();

		if (message) {
			addMessageToChatHistory('User', message);
			messageInput.value = '';
			sendMessageToAPI(conversationId, message);
		}
	}
});

clearButton.addEventListener('click', async () => {
	window.localStorage.removeItem(conversationIdKey);
	conversationId = getOrSetConversationId();
	notify("Clearing history and starting new conversation.");
	chatHistory.innerHTML = '';
	await fetch(`/api/${conversationId}`, { method: "DELETE" });
});

function uuidv4() {
	return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
		(c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
	);
}

function notify(message) {
	const notification = document.createElement('div');
	notification.classList.add('notification');
	notification.textContent = message;

	// Add the notification to the body
	document.body.appendChild(notification);

	// Set a timeout to remove the notification after 3 seconds
	setTimeout(() => {
		notification.classList.add('hide');
	}, 3000);
}
