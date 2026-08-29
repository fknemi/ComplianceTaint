import os
import logging
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from requests.exceptions import RequestException, JSONDecodeError
from typing import Dict, Any, Optional, Union

logger = logging.getLogger(__name__)


class APIError(Exception):
    """Base exception for API Client errors."""
    pass


class APIClient:
    def __init__(
        self,
        base_url: str = "",
        api_key: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 3
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.api_key = api_key or os.getenv("LATENT_GRAPH_API_KEY")
        
        self.session = requests.Session()
        
        # 1. Setup Robust Retry Strategy
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=1,  # 1s, 2s, 4s...
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "PUT", "DELETE", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        if not self.api_key:
            logger.warning("No API key provided. Authentication may fail.")

        # 2. Clean Header Assignment
        headers = {
            "User-Agent": "ComplianceTaint/1.0",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br, zstd",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            
        self.session.headers.update(headers)

    def _request(
        self, method: str, endpoint: str, **kwargs
    ) -> Union[Dict[str, Any], str, None]:
        """Internal method to handle all HTTP requests."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}" if self.base_url else endpoint
        kwargs.setdefault("timeout", self.timeout)

        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()

            if not response.content:
                return None
                
            try:
                return response.json()
            except JSONDecodeError:
                return response.text

        except RequestException as e:
            # 3. Raise Contextual Custom Exception
            logger.error(f"[{method}] Request failed for {url}: {e}")
            raise APIError(f"HTTP Request failed: {e}") from e

    def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None, **kwargs):
        return self._request("GET", endpoint, params=params, **kwargs)

    def post(
        self,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs,
    ):
        return self._request("POST", endpoint, data=data, json=json, **kwargs)

    def put(
        self,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs,
    ):
        return self._request("PUT", endpoint, data=data, json=json, **kwargs)

    def delete(self, endpoint: str, **kwargs):
        return self._request("DELETE", endpoint, **kwargs)

    def update_token(self, new_token: str):
        """Update the Bearer token safely."""
        self.api_key = new_token
        self.session.headers.update({"Authorization": f"Bearer {new_token}"})

    def close(self):
        self.session.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
