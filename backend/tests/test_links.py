import pytest

from app.engine.links import analyse_link


def ids(result) -> set[str]:
    return {s.id for s in result.signals}


@pytest.mark.parametrize(
    "url, signal",
    [
        ("http://sbi-kyc-update.xyz/login", "brand_mismatch"),
        ("https://paytm.rewards-claim.top/", "brand_mismatch"),
        ("https://amaz0n.in/deal", "lookalike_domain"),
        ("https://flipkrat.com/offer", "lookalike_domain"),
        ("http://onlinesbi.sbi@198.51.100.7/login", "userinfo_trick"),
        ("http://203.0.113.9/verify", "ip_address_host"),
        ("https://xn--pple-43d.com/", "lookalike_characters"),
        ("https://cybercrime-gov-help.in/complaint", "fake_government"),
        ("https://example.com/files/SBI_Rewards.apk", "app_download"),
        ("javascript:alert(1)", "dangerous_scheme"),
    ],
)
def test_high_risk_links(url, signal):
    result = analyse_link(url, network=False)
    assert signal in ids(result)
    assert result.status == "high_risk"


def test_upi_payment_link_is_suspicious_with_explanation():
    result = analyse_link("upi://pay?pa=someone@ybl&am=5000", network=False)
    assert result.status == "suspicious"
    assert "upi_payment_link" in ids(result)


@pytest.mark.parametrize(
    "url, brand",
    [
        ("https://www.onlinesbi.sbi/", "sbi"),
        ("https://www.hdfcbank.com/personal", "hdfc"),
        ("https://www.amazon.in/gp/cart", "amazon"),
        ("https://hdfc.bank.in/", "hdfc"),
        ("https://unionbank.bank.in/", "bank"),
        ("https://cybercrime.gov.in/", "government"),
    ],
)
def test_official_domains_are_recognised(url, brand):
    result = analyse_link(url, network=False)
    assert result.official_brand == brand
    assert result.status == "safe"


def test_unknown_clean_link_is_never_called_safe_without_a_threat_check():
    result = analyse_link("https://some-local-bakery.com/menu", network=False)
    assert result.status == "unable_to_verify"


def test_link_without_scheme_and_invalid_input():
    assert analyse_link("www.amazon.in", network=False).status == "safe"
    assert analyse_link("not a link at all", network=False).status == "invalid"
    assert analyse_link("", network=False).status == "invalid"
    assert analyse_link("http://" + "a" * 3000 + ".com", network=False).status == "invalid"


def test_shortener_without_network_cannot_be_verified():
    result = analyse_link("https://bit.ly/3abcDEF", network=False)
    assert result.status == "unable_to_verify"
    assert "shortened" in ids(result)


def test_ordinary_words_do_not_trigger_brand_matching():
    # "public" contains "lic", "office" is not an impersonation of office.com, and so on.
    for url in ("https://publicholidays.in/", "https://offices.example.org/", "https://republicworld.com/"):
        result = analyse_link(url, network=False)
        assert "brand_mismatch" not in ids(result), url
        assert "lookalike_domain" not in ids(result), url
