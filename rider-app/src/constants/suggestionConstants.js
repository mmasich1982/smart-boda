// rider-app/src/constants/suggestionConstants.js
/**
 * Suggestion categories for RA-35 (Suggestions & Feedback)
 * These must match the backend's suggestion_category_master table
 */
export const SUGGESTION_CATEGORIES = [
  {
    key: 'Idea',
    emoji: '💡',
    label: 'I Have An Idea'
  },
  {
    key: 'Problem',
    emoji: '😕',
    label: 'Something\'s Wrong'
  },
  {
    key: 'Compliment',
    emoji: '❤️',
    label: 'Just Saying Thanks'
  },
  {
    key: 'Other',
    emoji: '💬',
    label: 'Something Else'
  },
];

export const SUGGESTION_CONFIG = {
  MESSAGE_MAX_LENGTH: 500,
  PLACEHOLDER: 'e.g. I wish I could see my weekly earnings on the home screen...',
  EMPTY_STATE_MESSAGE: 'No feedback sent yet — this is just for you, so feel free to share anything.',
};

export function getCategoryByKey(key) {
  return SUGGESTION_CATEGORIES.find(c => c.key === key) || SUGGESTION_CATEGORIES[3]; // Default to 'Other'
}

export function getCategoryLabel(key) {
  const category = getCategoryByKey(key);
  return category ? category.label : 'Other';
}

export function getCategoryEmoji(key) {
  const category = getCategoryByKey(key);
  return category ? category.emoji : '💬';
}