"""lambdas/macro_update_worker/handler 단위 테스트."""

from __future__ import annotations

import json
from unittest.mock import patch

from lambdas.macro_update_worker.handler import lambda_handler


class TestSuccess:
    def test_returns_200_when_all_indicators_updated(self):
        mock_result = {
            "updated": {"federal_funds_rate": {"value": 5.25}},
            "errors": [],
        }
        patch_target = "lambdas.macro_update_worker.handler.update_all_indicators"
        with patch(patch_target, return_value=mock_result):
            response = lambda_handler({}, None)

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["updated"]["federal_funds_rate"]["value"] == 5.25

    def test_returns_207_on_partial_success(self):
        mock_result = {
            "updated": {"cpi": {"value": 314.0}},
            "errors": ["federal_funds_rate: API error"],
        }
        patch_target = "lambdas.macro_update_worker.handler.update_all_indicators"
        with patch(patch_target, return_value=mock_result):
            response = lambda_handler({}, None)

        assert response["statusCode"] == 207

    def test_returns_500_on_fatal_error(self):
        from core.macro_updater import MacroUpdateError

        with patch(
            "lambdas.macro_update_worker.handler.update_all_indicators",
            side_effect=MacroUpdateError("No API key"),
        ):
            response = lambda_handler({}, None)

        assert response["statusCode"] == 500
        body = json.loads(response["body"])
        assert "error" in body


class TestIdempotency:
    def test_handler_called_multiple_times_without_side_effects(self):
        mock_result = {"updated": {}, "errors": []}
        with patch(
            "lambdas.macro_update_worker.handler.update_all_indicators", return_value=mock_result
        ) as mock:
            lambda_handler({}, None)
            lambda_handler({}, None)

        assert mock.call_count == 2
