"""Shared wind thresholds used by generator and critic."""

HIGH_WIND_THRESHOLD_KNOTS = 30
BREEZY_WIND_THRESHOLD_KNOTS = 17

# The critic's "strong wind" validation threshold intentionally matches the
# generator's breezy/high-wind language cutoff so summary wording stays aligned.
STRONG_WIND_THRESHOLD_KNOTS = BREEZY_WIND_THRESHOLD_KNOTS
