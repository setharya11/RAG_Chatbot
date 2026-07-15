from embedding_server import generate_embedding

text = "What is Artificial Intelligence?"

embedding = generate_embedding(text)

print(type(embedding))
print(len(embedding))
print(embedding[:10])