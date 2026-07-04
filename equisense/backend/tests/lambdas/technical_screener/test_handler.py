"""lambdas/technical_screener/handler 단위 테스트."""

from __future__ import annotations

import json
from unittest.mock import patch

from lambdas.technical_screener.handler import lambda_handler


class TestSuccess:
    def test_returns_200_when_all_screened(self):
        mock_result = {
            "screened": 5,
            "undervalued": ["AAPL"],
            "overbought": [],
            "errors": [],
        }
        patch_target = "lambdas.technical_screener.handler.screen_all_companies"
        with patch(patch_target, return_value=mock_result):
            response = lambda_handler({}, None)

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["screened"] == 5
        assert body["undervalued"] == ["AAPL"]

    def test_returns_207_on_partial_errors(self):
        mock_result = {
            "screened": 3,
            "undervalued": [],
            "overbought": [],
            "errors": ["ERR: db error"],
        }
        patch_target = "lambdas.technical_screener.handler.screen_all_companies"
        with patch(patch_target, return_value=mock_result):
            response = lambda_handler({}, None)

        assert response["statusCode"] == 207

    def test_returns_500_on_fatal_error(self):
        from core.technical_screener import ScreenerError

        with patch(
            "lambdas.technical_screener.handler.screen_all_companies",
            side_effect=ScreenerError("DB unavailable"),
        ):
            response = lambda_handler({}, None)

        assert response["statusCode"] == 500
        body = json.loads(response["body"])
        assert "error" in body
