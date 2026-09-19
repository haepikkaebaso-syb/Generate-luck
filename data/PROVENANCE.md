# Official Korean Lotto 6/45 data: recent 10 years

- Requested date window: 2016-09-13 through 2026-09-13 (Asia/Seoul).
- Actual draws within that window: 720 (2016-09-17) through 1241 (2026-09-12), inclusive, 522 draws.
- Coverage: complete; all 522 expected weekly Saturday draws are present.
- Source: official Donghaeng Lottery website. No workbook or third-party mirror was used.
- Source page: https://m.dhlottery.co.kr/lt645/result
- Public API used by that page: https://m.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do
- The result page's `fn_selectPstLt645Info` JavaScript defines the API and its GET parameters.
- Initial GET: `?srchDir=center&srchLtEpsd=1241`.
- Older pages: `?srchDir=older&srchCursorLtEpsd=<oldest fetched round>`.
- Pages return up to 10 records. We traversed back until the oldest date preceded the requested start, then filtered the exact inclusive date window.
- Latest published round was detected from the official result page's dropdown, not inferred from calendar arithmetic.

## Files

- `draws.json`: normalized dataset `{metadata, draws}`.
- `../scripts/acquire_official_draws.py`: reproducible source acquisition and integrity checks.
- `source-manifest.json`: exact request URL, content type, byte count, file path, SHA256 for every retained raw response.
- `raw/`: official page snapshot and 53 unmodified API JSON responses.

## Field mapping

| Normalized field | Official field |
|---|---|
| round | ltEpsd |
| date | ltRflYmd, reformatted YYYYMMDD to YYYY-MM-DD |
| numbers | tm1WnNo through tm6WnNo |
| bonus | bnsWnNo |
| firstPrizeWinners | rnk1WnNope |
| firstPrizePerWinner | rnk1WnAmt (KRW) |

## Integrity checks

All checks passed: unique and contiguous round IDs; exact 7-day interval between consecutive dates; all dates Saturdays; six distinct sorted integers 1 through 45 in each draw; bonus 1 through 45 and outside the main six; no dates after the requested as-of date; exact full-window count and first/last Saturday dates; saved raw-file SHA256 match.

The normalized dates and numbers are factual draw records. This dataset and past frequency patterns do not establish an ability to predict future draws.

The browser search tool could read the official result page but did not support opening the JSON query URLs. Direct HTTPS GET through Python fetched those official endpoints successfully with HTTP 200 and `application/json;charset=UTF-8`. The raw originals are retained for inspection.
