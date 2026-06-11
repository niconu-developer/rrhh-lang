import sqlite3

from .settings import DB_PATH


def connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def rows(sql, params=()):
    with connect() as connection:
        return [dict(row) for row in connection.execute(sql, params).fetchall()]


def one(sql, params=()):
    with connect() as connection:
        row = connection.execute(sql, params).fetchone()
        return dict(row) if row else None
