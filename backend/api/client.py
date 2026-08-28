import os
import requests
from requests.exceptions import RequestException, JSONDecodeError
from typing import Dict, Any, Optional, Union
import logging

logger = logging.getLogger(__name__)


class APIClient:
    def __init__(
        self, base_url: str = "", api_key: Optional[str] = None, timeout: int = 30
    ):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()

        # Get API key from parameter or environment variable
        self.api_key = api_key or os.getenv("LATENT_GRAPH_API_KEY")

        if not self.api_key:
            logger.warning("No API key provided. Authentication may fail.")

        # Set default headers
        self.session.headers.update(
            {
                "User-Agent": "ComplianceTaint/1.0",
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
            }
        )

        self.timeout = timeout

    def _request(
        self, method: str, endpoint: str, **kwargs
    ) -> Union[Dict[str, Any], str, None]:
        """Internal method to handle all HTTP requests."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}" if self.base_url else endpoint

        # Set default timeout
        kwargs.setdefault("timeout", self.timeout)

        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()

            if response.content:
                try:
                    return response.json()
                except JSONDecodeError:
                    return response.text
            return None

        except RequestException as e:
            logger.error(f"[{method}] Request failed for {url}: {e}")
            raise

    def get(self, endpoint: str, params: Optional[Dict] = None, **kwargs):
        """Send a GET request."""
        return self._request("GET", endpoint, params=params, **kwargs)

    def post(
        self,
        endpoint: str,
        data: Optional[Dict] = None,
        json: Optional[Dict] = None,
        **kwargs,
    ):
        """Send a POST request."""
        return self._request("POST", endpoint, data=data, json=json, **kwargs)

    def put(
        self,
        endpoint: str,
        data: Optional[Dict] = None,
        json: Optional[Dict] = None,
        **kwargs,
    ):
        """Send a PUT request."""
        return self._request("PUT", endpoint, data=data, json=json, **kwargs)

    def delete(self, endpoint: str, **kwargs):
        """Send a DELETE request."""
        return self._request("DELETE", endpoint, **kwargs)

    def update_token(self, new_token: str):
        """Update the Bearer token."""
        self.api_key = new_token
        self.session.headers.update({"Authorization": f"Bearer {new_token}"})

    def close(self):
        """Close the underlying requests session."""
        self.session.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
