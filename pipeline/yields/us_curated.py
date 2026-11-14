"""Curated US county yields (t/ha) kept from the LUCA branch.

These values were typed in from USDA NASS Quick Stats but NOT fetched programmatically (no
``NASS_API_KEY`` is available in CI), so they are flagged ``verified: false`` in the published
validation files. Set ``NASS_API_KEY`` and run ``python -m pipeline.yields.fetch_yields`` to replace
them with live Quick Stats values for iowa / kansas.
"""

from __future__ import annotations

US_CURATED: dict[str, dict[str, dict[int, float]]] = {
    "iowa": {
        "maize": {
            2001: 9.7, 2002: 10.9, 2003: 10.2, 2004: 11.7, 2005: 11.4, 2006: 11.0, 2007: 11.2,
            2008: 11.1, 2009: 11.6, 2010: 10.4, 2011: 10.8, 2012: 7.8, 2013: 10.3, 2014: 11.5,
            2015: 12.1, 2016: 13.0, 2017: 12.4, 2018: 12.3, 2019: 12.2, 2020: 10.6, 2021: 12.9,
            2022: 12.5, 2023: 12.6, 2024: 13.1,
        },
        "soybean": {
            2001: 3.0, 2002: 3.4, 2003: 2.4, 2004: 3.5, 2005: 3.7, 2006: 3.6, 2007: 3.6,
            2008: 3.2, 2009: 3.5, 2010: 3.6, 2011: 3.5, 2012: 2.7, 2013: 3.1, 2014: 3.6,
            2015: 3.9, 2016: 4.1, 2017: 3.8, 2018: 3.8, 2019: 3.7, 2020: 3.6, 2021: 4.2,
            2022: 4.0, 2023: 4.0, 2024: 4.2,
        },
    },
    "kansas": {
        "wheat": {
            2002: 2.2, 2003: 3.5, 2004: 2.5, 2005: 3.0, 2006: 2.0, 2007: 3.3, 2008: 2.9,
            2009: 3.4, 2010: 3.6, 2011: 1.9, 2012: 2.4, 2013: 2.1, 2014: 1.8, 2015: 2.7,
            2016: 4.0, 2017: 3.3, 2018: 2.5, 2019: 3.9, 2020: 3.1, 2021: 3.7, 2022: 1.7,
            2023: 2.0, 2024: 2.9,
        },
        "sorghum": {
            2001: 4.3, 2002: 2.8, 2003: 3.1, 2004: 4.6, 2005: 4.4, 2006: 3.2, 2007: 5.1,
            2008: 4.8, 2009: 5.4, 2010: 4.7, 2011: 2.4, 2012: 2.3, 2013: 3.9, 2014: 4.2,
            2015: 5.6, 2016: 5.9, 2017: 5.2, 2018: 5.3, 2019: 5.5, 2020: 4.6, 2021: 5.1,
            2022: 2.2, 2023: 3.1, 2024: 4.5,
        },
    },
}

US_REGIONS = {
    "iowa": ("Story County, IA", "STORY", "IOWA", "https://quickstats.nass.usda.gov/"),
    "kansas": ("Finney County, KS", "FINNEY", "KANSAS", "https://quickstats.nass.usda.gov/"),
}
