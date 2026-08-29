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
    """
    A robust HTTP client for interacting with RESTful APIs.

    Handles connection pooling, automatic retries for transient failures,
    and authentication token management.
    """

    def __init__(
        self,
        base_url: str = "",
        api_key: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 3,
    ):
        """
        Initializes the API client with connection settings and authentication.

        Args:
            base_url (str): The base URL for all API requests. Defaults to an empty string.
            api_key (Optional[str]): The bearer token for API authentication. If not provided,
                                     attempts to load from the 'LATENT_GRAPH_API_KEY' environment variable.
            timeout (int): The maximum time (in seconds) to wait for a response. Defaults to 30.
            max_retries (int): The maximum number of retry attempts for failed requests
                               (e.g., rate limits or server errors). Defaults to 3.
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.api_key = api_key or os.getenv("LATENT_GRAPH_API_KEY")

        self.session = requests.Session()

        retry_strategy = Retry(
            total=max_retries,
            connect=5,
            read=5,
            backoff_factor=2,  # 1s, 2s, 4s...
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "POST"],
            respect_retry_after_header=True,
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        if not self.api_key:
            logger.warning("No API key provided. Authentication may fail.")

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
        """
        Executes an HTTP request and processes the response.

        Constructs the final URL, enforces timeouts, and automatically attempts to
        decode the response payload as JSON.

        Args:
            method (str): The HTTP method to use (e.g., 'GET', 'POST').
            endpoint (str): The API endpoint path or full URL.
            **kwargs: Additional keyword arguments passed to `requests.Session.request`.

        Returns:
            Union[Dict[str, Any], str, None]: The parsed JSON dictionary, the raw string
                                              response if JSON decoding fails, or None if the response is empty.

        Raises:
            APIError: If the HTTP request fails, times out, or returns an error status code.
        """
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
            logger.error(f"[{method}] Request failed for {url}: {e}")
            raise APIError(f"HTTP Request failed: {e}") from e

    def get(
        self, endpoint: str, params: Optional[Dict[str, Any]] = None, **kwargs
    ) -> Union[Dict[str, Any], str, None]:
        """
        Sends an HTTP GET request to retrieve resources.

        Args:
            endpoint (str): The API endpoint to request.
            params (Optional[Dict[str, Any]]): Query string parameters to append to the URL.
            **kwargs: Additional keyword arguments passed to the underlying request.

        Returns:
            Union[Dict[str, Any], str, None]: The server's response payload.
        """
        return self._request("GET", endpoint, params=params, **kwargs)

    def post(
        self,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> Union[Dict[str, Any], str, None]:
        """
        Sends an HTTP POST request to create or submit resources.

        Args:
            endpoint (str): The API endpoint to request.
            data (Optional[Dict[str, Any]]): Form-encoded data to send in the request body.
            json (Optional[Dict[str, Any]]): JSON-encoded data to send in the request body.
            **kwargs: Additional keyword arguments passed to the underlying request.

        Returns:
            Union[Dict[str, Any], str, None]: The server's response payload.
        """
        return self._request("POST", endpoint, data=data, json=json, **kwargs)

    def put(
        self,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> Union[Dict[str, Any], str, None]:
        """
        Sends an HTTP PUT request to update or replace resources.

        Args:
            endpoint (str): The API endpoint to request.
            data (Optional[Dict[str, Any]]): Form-encoded data to send in the request body.
            json (Optional[Dict[str, Any]]): JSON-encoded data to send in the request body.
            **kwargs: Additional keyword arguments passed to the underlying request.

        Returns:
            Union[Dict[str, Any], str, None]: The server's response payload.
        """
        return self._request("PUT", endpoint, data=data, json=json, **kwargs)

    def delete(self, endpoint: str, **kwargs) -> Union[Dict[str, Any], str, None]:
        """
        Sends an HTTP DELETE request to remove resources.

        Args:
            endpoint (str): The API endpoint to request.
            **kwargs: Additional keyword arguments passed to the underlying request.

        Returns:
            Union[Dict[str, Any], str, None]: The server's response payload.
        """
        return self._request("DELETE", endpoint, **kwargs)

    def update_token(self, new_token: str) -> None:
        """
        Updates the Bearer token used for authorization in subsequent requests.

        Args:
            new_token (str): The new API authentication token.
        """
        self.api_key = new_token
        self.session.headers.update({"Authorization": f"Bearer {new_token}"})

    def close(self) -> None:
        """
        Closes the underlying HTTP session and releases all associated connections.
        """
        self.session.close()

    def __enter__(self):
        """
        Enters the runtime context related to this object, allowing it to be used with the 'with' statement.
        """
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """
        Exits the runtime context, ensuring that the HTTP session is properly closed.

        Args:
            exc_type: The exception type if an exception was raised.
            exc_val: The exception value if an exception was raised.
            exc_tb: The exception traceback if an exception was raised.
        """
        self.close()
