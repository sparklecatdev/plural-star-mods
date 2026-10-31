import React from 'react';
import Svg, {Path} from 'react-native-svg';

const paths: Record<string, string> = {
  planner: 'M4 5h16v15H4z M8 3v4 M16 3v4 M4 9h16 M8 13h3v3H8z',
  retroHistory: 'M4 12a8 8 0 1 0 2-5 M4 3v5h5 M12 7v5l4 2',
  statistics: 'M4 20V11h4v9 M10 20V4h4v16 M16 20v-6h4v6 M3 20h18',
  chat: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  mailbox: 'M3 9l9-6 9 6v11H3z M3 9l9 7 9-7',
  whiteboard: 'M3 4h18v13H3z M12 17v4 M8 21h8 M7 13l3-3 3 2 4-5',
  colors: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4 2 2 0 0 1 0-4h3a4 4 0 0 0 4-4c0-3-4-6-9-6z M7 10h.1 M10 6h.1 M15 7h.1',
  network: 'M12 3v6 M5 19l5-6 M19 19l-5-6 M12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M19 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  polls: 'M4 4h16v16H4z M7 8h2v2H7z M12 9h5 M7 14h2v2H7z M12 15h5',
  systemMap: 'M4 5h6v5H4z M14 14h6v5h-6z M10 7h5v7 M7 10v7h7',
  customFields: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',
  systemManager: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M5 20c0-4 3-6 7-6s7 2 7 6',
  archive: 'M4 7h16v13H4z M3 4h18v3H3z M9 11h6',
  share: 'M12 4v11 M8 8l4-4 4 4 M4 14v6h16v-6',
  credits: 'M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6-4.3-4.2 6-.9z',
  discord: 'M6 6c4-2 8-2 12 0l3 11c-2 2-4 3-6 3l-1-2h-4l-1 2c-2 0-4-1-6-3z M8 13h.1 M16 13h.1 M8 16c3 2 5 2 8 0',
  supportPS: 'M12 20S4 15 4 9a4 4 0 0 1 8-2 4 4 0 0 1 8 2c0 6-8 11-8 11z',
};
export function HubIcon({id, color, size}: {id: string; color: string; size: number}) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}><Path d={paths[id]} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
