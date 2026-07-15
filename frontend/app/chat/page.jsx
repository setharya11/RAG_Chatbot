"use client";

import { useState } from "react";
import { sendMessage } from "@/src/api/chat";

export default function ChatPage() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");

    const handleSend = async () => {
        if (!input.trim()) return;

        const userText = input;

        setMessages((prev) => [
            ...prev,
            { role: "user", content: userText },
        ]);

        setInput("");

        const data = await sendMessage(1, userText);

        setMessages((prev) => [
            ...prev,
            { role: "assistant", content: data.assistant_message },
        ]);
    };

    return (
        <div style={{ padding: "30px", maxWidth: "800px", margin: "auto" }}>
            <h1>RAG Chatbot</h1>

            <div style={{ minHeight: "400px", border: "1px solid #ddd", padding: "20px" }}>
                {messages.map((msg, index) => (
                    <div key={index} style={{ marginBottom: "15px" }}>
                        <b>{msg.role === "user" ? "You" : "Bot"}:</b> {msg.content}
                    </div>
                ))}
            </div>

            <div style={{ marginTop: "20px", display: "flex", gap: "10px" }}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask something..."
                    style={{ flex: 1, padding: "12px" }}
                />

                <button onClick={handleSend} style={{ padding: "12px 20px" }}>
                    Send
                </button>
            </div>
        </div>
    );
}