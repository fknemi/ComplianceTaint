# debg.py
from mcp.client import get_file
import os
from dotenv import load_dotenv
load_dotenv()

pid = os.getenv("LATENT_GRAPH_PROJECT_ID")
result = get_file(pid, "services/payment-service/paymentService.js", "main")
print(result.get("summary", ""))
