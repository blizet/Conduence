from typing import Any


def _header_name(header: Any) -> str:
    """FalkorDB headers are often [type_code, column_name] e.g. [1, 'id']."""
    if isinstance(header, (list, tuple)):
        if len(header) >= 2:
            return str(header[-1])
        if len(header) == 1:
            return str(header[0])
    return str(header)


def parse_falkor_rows(result: Any) -> list[dict[str, Any]]:
    if result is None:
        return []
    headers = getattr(result, "header", None) or getattr(result, "headers", None) or []
    data = getattr(result, "result_set", None) or getattr(result, "data", None) or []
    if not data:
        return []

    column_names = [_header_name(h) for h in headers]

    rows: list[dict[str, Any]] = []
    for row in data:
        if isinstance(row, (list, tuple)):
            obj: dict[str, Any] = {}
            for i, name in enumerate(column_names):
                if i < len(row):
                    obj[name] = row[i]
            rows.append(obj)
        elif isinstance(row, dict):
            rows.append(row)
    return rows


def row_flag(row: dict[str, Any], *keys: str) -> bool:
    for key in keys:
        v = row.get(key)
        if v is True or v == 1 or v == "true" or v == "1":
            return True
    return False


def row_string(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        v = row.get(key)
        if v is not None and v != "":
            return str(v)
    return ""
