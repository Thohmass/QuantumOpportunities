// One simple line icon per event type (24×24 grid, drawn with round strokes; our own drawings). Used in type
// labels, the Event type filter and inside the large map bubbles.

export const TYPE_ICONS: Record<string, string> = {
  // two speech bubbles: talks and discussion
  conference: 'M4 5h11v8H9l-3 3v-3H4zM15 9h5v8h-2v3l-3-3h-4v-2',
  // a wrench: hands-on work
  workshop:
    'M15 4a4 4 0 0 0-3.9 5L4 16.1a2 2 0 0 0 2.9 2.9L14 11.9A4 4 0 0 0 19.5 8l-2.5 2.5-2.5-2.5L17 5.5A4 4 0 0 0 15 4z',
  // code brackets
  hackathon: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  // a trophy
  challenge: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8',
  // the sun
  summer_school:
    'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  // a snowflake
  winter_school:
    'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3.6 10.7l3.3-.9-.9-3.3M20.4 13.3l-3.3.9.9 3.3M3.6 13.3l3.3.9-.9 3.3M20.4 10.7l-3.3-.9.9-3.3',
  // an open book
  programme: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
  // people
  meetup:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a2.5 2.5 0 1 0 0-5M18 20a5 5 0 0 0-3-4.6',
  // a briefcase
  career_fair: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  // a sparkle
  other: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
};

export const typeIcon = (type: string): string => TYPE_ICONS[type] ?? TYPE_ICONS.other!;
