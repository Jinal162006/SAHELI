"""add emergency recording evidence foreign key

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-12

"""
from typing import Sequence, Union

from alembic import op


revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_foreign_key(
        "fk_emergency_events_recording_evidence_id_evidence_items",
        "emergency_events",
        "evidence_items",
        ["recording_evidence_id"],
        ["id"],
        source_schema="saheli",
        referent_schema="saheli",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_emergency_events_recording_evidence_id_evidence_items",
        "emergency_events",
        schema="saheli",
        type_="foreignkey",
    )
