from dotenv import load_dotenv
load_dotenv()

from mcp import client


print(client.get_file("ff65c5aa-4f75-4fcc-a9b0-8b9ea463f86a","config/kafka.config.js","main"))
