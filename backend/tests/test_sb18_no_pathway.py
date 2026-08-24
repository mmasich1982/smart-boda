# backend/tests/test_sb18_no_pathway.py
from app.models.compliance_master_data import DocumentTypeMaster


def test_document_types_are_exactly_two_and_carry_no_pathway_fields(db_session):
    db_session.add(DocumentTypeMaster(code="psv_licence", display_name="PSV Licence", expires=True, sort_order=1))
    db_session.add(DocumentTypeMaster(code="insurance_certificate", display_name="Insurance Certificate",
                                       expires=True, sort_order=2))
    db_session.commit()
    codes = {t.code for t in db_session.query(DocumentTypeMaster).all()}
    assert codes == {"psv_licence", "insurance_certificate"}  # BR-SB18-002
    assert not hasattr(DocumentTypeMaster, "pathway_url")  # BR-SB18-011: the column doesn't exist at all
