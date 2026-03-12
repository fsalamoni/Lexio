"""Lexio Module — Direito Previdenciário."""

from packages.modules.legal_areas.social_security.area import SocialSecurityArea

MODULE_CLASS = SocialSecurityArea


def create_module():
    return SocialSecurityArea()
