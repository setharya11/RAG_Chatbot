const API_URL = "http://127.0.0.1:8000";

export async function sendMessage(userId, message) {
    const res = await fetch(`${API_URL}/chats/send`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            user_id: userId,
            message,
        }),
    });

    return res.json();
}

export async function getChatMessages(sessionId) {
    const res = await fetch(`${API_URL}/chats/${sessionId}/messages`);
    return res.json();
}

export async function getUserChats(userId) {
    const res = await fetch(`${API_URL}/chats/${userId}`);
    return res.json();
}