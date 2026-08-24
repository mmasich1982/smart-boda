// rider-app/src/theme/typography.js
// Typography system for consistent text styling across the app
// Mirrors cleaned.html's font sizing and weights

export const Typography = {
  // Headline / Title styles
  headline: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    letterSpacing: -0.01,
  },

  // Display / Large headline
  display: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.01,
  },

  // Title / Screen title
  title: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 24,
  },

  // Subtitle / Screen subtitle
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: '#5b606c',
  },

  // Body / Main text
  body: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },

  // Body medium
  bodyMedium: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },

  // Body small
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },

  // Label / Form labels
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },

  // Caption / Small text
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },

  // Caption medium
  captionMedium: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },

  // Hint / Helper text
  hint: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
    color: '#5b606c',
  },

  // Error message text
  error: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    color: '#e0453f',
  },

  // Button text
  button: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },

  // Small button text
  buttonSmall: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },

  // Mono / Code text
  mono: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
    fontFamily: 'JetBrains Mono',
  },

  // Trace / Debug text (very small)
  trace: {
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 12,
    color: '#787e8c',
  },
};

// Default export for backwards compatibility
export default Typography;